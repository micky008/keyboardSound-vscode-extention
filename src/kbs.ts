import * as vscode from 'vscode';
import { EventSource } from 'eventsource';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import os, { tmpdir } from 'os';
import player from 'play-sound';

class Treeitem { public id: string = ""; public name: string = "" }

class Channel extends Treeitem { public sons: Sound[] = [] } //id=c1

class Sound extends Treeitem { channel: Channel = new Channel() }//id=s1

export class KeyboardSoundExtention {

	private channels: Channel[] = [];

	constructor(context: vscode.ExtensionContext) {
		this.initMethode(context);
		this.loadSSE();
	}

	private loadSSE() {
		//Activating extension 'undefined_publisher.kbsv3' failed: EventSource is not defined.
		const sse = new EventSource("http://localhost:9998/sse");
		sse.addEventListener("play", (e) => {		//data reçu:  c1:s1			
			let split = e.data.split(":");
			let url = "http://localhost:9998/sound/" + split[0] + "/" + split[1];
			this.playSound(url);
		});
	}

	private async playSound(url: string) {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Erreur HTTP: ${response.status}`);
		}
		if (response.body) {
			const nodeStream = Readable.fromWeb(response.body);
			const tmpDir = os.tmpdir();
			let fichierDest = tmpdir + "/fichier.mp3";
			const fileStream = fs.createWriteStream(fichierDest);
			await pipeline(nodeStream, fileStream);
			const audioPlayer = player();
			const audio = audioPlayer.play(fichierDest, (err) => {
				if (err) throw err;
			});
		}
	}

	private async initMethode(context: vscode.ExtensionContext) {
		let response = await fetch("http://localhost:9998/channel/");
		this.channels = await response.json() as Channel[];
		for (let chan of this.channels) {
			let url = "http://localhost:9998/sound/" + chan.id;
			let resp = await fetch(url);
			chan.sons = await resp.json() as Sound[];
			for (let s of chan.sons) {
				s.channel = chan;
			}
		}
		const view = vscode.window.createTreeView('kbs', { treeDataProvider: this.createTreeDataProvider(), showCollapseAll: true });
		context.subscriptions.push(view);
	}

	createTreeDataProvider(): vscode.TreeDataProvider<Treeitem> {
		return {
			getChildren: (element: Treeitem): Treeitem[] => {
				if (!element) {
					return this.channels;
				}
				if (element.id.startsWith('s')) {
					return [];
				}
				if (element.id.startsWith('c')) {
					let chan = element as Channel;
					return chan.sons;
				}
				return [element];
			},
			getTreeItem: (element: Treeitem): vscode.TreeItem => {
				return {
					contextValue: element.id.startsWith('c') ? 'channel' : 'sound',
					label: element.name,
					collapsibleState: element.id.startsWith('c') ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
				};
			},

		};
	}

	sendSound(sound: Sound) {
		let url = `http://localhost:9998/sse/${sound.channel.id}/${sound.id}`
		fetch(url, { method: "POST" }).then(() => { });
	}


}

