import * as vscode from 'vscode';
import { EventSource } from 'eventsource';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import os, { tmpdir } from 'os';
import player from 'play-sound';
import { ProxyAgent, setGlobalDispatcher } from 'undici'

class Treeitem { public id: string = ""; public name: string = "" }

class Channel extends Treeitem { public sons: Sound[] = [] } //id=c1

class Sound extends Treeitem { channel: Channel = new Channel() }//id=s1

export class KeyboardSoundExtention {

	private channels: Channel[] = [];
	private serverUrl: string = "";
	private sseLink: any;

	constructor(context: vscode.ExtensionContext) {
		this.initConfUrlServer();
		this.initProxy();
		this.initGetSounds().then( () => {
			this.initMethode(context);
			this.loadSSE();
		});
	}

	public refresh(){
		this.initGetSounds().then( () => {			
			this.loadSSE();
		});
	}


	private initConfUrlServer() {
		const config = vscode.workspace.getConfiguration();
		this.serverUrl = config.get<string>('keyboardSound.address-webserice') as string;
		if (!this.serverUrl.endsWith('/')) {
			this.serverUrl += '/';
		}
	}

	private initProxy() {
		const config = vscode.workspace.getConfiguration('http');
		let proxyUrl = config.get<string>('proxy');
		if (proxyUrl) {
			let agent = new ProxyAgent(proxyUrl);
			setGlobalDispatcher(agent);
		}
	}

	private loadSSE() {
		if (this.sseLink != undefined){
			this.sseLink.close();
		}
		let url = this.serverUrl + "sse";
		this.sseLink = new EventSource(url);
		this.sseLink.addEventListener("play", (e: any) => {		//data reçu:  s		
			let url = this.serverUrl + "sound/" + e.data;
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

	private async getResponse(url: string): Promise<any> {
		let response = await fetch(url);
		return await response.json();
	}

	private async initGetSounds(): Promise<void> {
		this.channels = [];
		let mapSoundRaw = await this.getResponse(this.serverUrl + "sound");
		let mapSound = new Map<string, Sound[]>(Object.entries(mapSoundRaw));
		let channelsRaw = await this.getResponse(this.serverUrl + "channel");
		let mapChannels = new Map<string, Channel>(Object.entries(channelsRaw));
		mapSound.forEach((v: Sound[], k: string) => {
			let chan = mapChannels.get(k) as Channel;
			chan.sons = v; // obliger de ratacher les sons au channel.
			this.channels.push(chan);
		});
		return Promise.resolve(undefined);
	}

	private initMethode(context: vscode.ExtensionContext) {
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
		let url = `${this.serverUrl}sse/${sound.id}`;
		fetch(url, { method: "POST" }).then(() => { });
	}
}

