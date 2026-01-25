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
		const sse = new EventSource("http://localhost:9998/sse");
		sse.addEventListener("play", (e) => {		//data reçu:  s1		
			let url = "http://localhost:9998/sound/" + e.data;
			this.playSound(url);
		});
	}

	private async playSound(url: string) {
		const response = await fetch(url);
		if (!response.ok) {
			console.error(response.statusText)
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
		let response = await fetch("http://localhost:9998/sound/");
		let mapRaw = await response.json() as Map<string, Sound[]>;
		let mapSound = new Map(Object.entries(mapRaw));
		response = await fetch("http://localhost:9998/channel/");
		let channelsRaw = await response.json() as Map<string, Channel>;
		let mapChannels = new Map(Object.entries(channelsRaw));
		//map.entries().next() // return un tableau tab[0] = key ; tab[1] = valeur		
		mapSound.forEach((v: Sound[], k: string) => {
			let chan = mapChannels.get(k) as Channel;
			chan.sons = v; // obliger de ratacher les sons au channel.
			this.channels.push(chan);
		});
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
		let url = `http://localhost:9998/sse/${sound.id}`;
		fetch(url, { method: "POST" }).then(() => { });
	}
}