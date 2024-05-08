import { Router } from 'express';
import { jsonParser } from '../../src/express-common.js';
import { createRequire } from 'module';
import { spawn } from 'child_process';
import simpleGit, { CheckRepoActions } from 'simple-git';
const require  = createRequire(import.meta.url);
const path = require('path');
const sanitize = require('sanitize-filename');
const fs = require('fs');



/**
 *
 * @param {Router} router
 */
export async function init(router) {
	router.get('/', jsonParser, (req, res)=>{
		res.send('plugin manager plugin is active');
	});
	router.get('/exit', jsonParser, (req, res)=>{
		process.emit('SIGINT');
		res.send('shutting down SillyTavern WebServer');
	});
	router.get('/restart', jsonParser, (req, res)=>{
		spawn(process.argv0, process.argv.slice(1), {
			stdio: 'ignore',
			detached: true,
			shell: true,
		}).unref();
		process.emit('SIGINT');
		res.send('restarting SillyTavern WebServer');
	});

	router.get('/list', jsonParser, async(req, res)=>{
		const git = simpleGit();
		const dir = path.join(process.cwd(), 'plugins');
		const items = fs.readdirSync(dir).filter(item=>{
			const lstat = fs.lstatSync(path.join(dir, item));
			return lstat.isDirectory();
		});
		const result = [];
		for (const item of items) {
			const dict = {
				name: item,
			}
			result.push(dict);
		};
		res.send(result);
	});
	router.post('/hasUpdates', jsonParser, async(req, res)=>{
		const git = simpleGit();
		const dir = path.join(process.cwd(), 'plugins');
		const plugin = path.join(dir, req.body.plugin);
		try {
			if (!(await git.cwd(plugin).checkIsRepo(CheckRepoActions.IS_REPO_ROOT))) {
				res.send({
					isRepo: false,
				});
				return;
			}
			await git.cwd(plugin).fetch('origin');
			const currentBranch = await git.cwd(plugin).branch();
			const currentCommitHash = await git.cwd(plugin).revparse(['HEAD']);
			const log = await git.cwd(plugin).log({
				from: currentCommitHash,
				to: `origin/${currentBranch.current}`,
			});
			// Fetch remote repository information
			const remotes = await git.cwd(plugin).getRemotes(true);
			res.send({
				isRepo: true,
				isUpToDate: log.total === 0,
				remoteUrl: remotes[0].refs.fetch, // URL of the remote repository
				branch: currentBranch,
				commit: currentCommitHash,
			});
		} catch (ex) {
			res.send({
				isRepo: false,
				ex,
			});
		}
	});
	router.post('/update', jsonParser, async(req, res)=>{
		const git = simpleGit();
		const dir = path.join(process.cwd(), 'plugins');
		const plugin = path.join(dir, req.body.plugin);
		try {
			await git.cwd(plugin).pull();
			res.send(true);
		} catch {
			res.send(false);
		}
	});
	router.post('/install', jsonParser, async(req, res)=>{
		const git = simpleGit();
		const dir = path.join(process.cwd(), 'plugins');
		const repo = req.body.url;
		try {
			git.cwd(dir).clone(repo);
			res.send(true);
		} catch {
			res.send(false);
		}
	});
	router.post('/uninstall', jsonParser, async(req, res)=>{
		const dir = path.join(process.cwd(), 'plugins');
		const plugin = path.join(dir, req.body.plugin);
		try {
			fs.rmdirSync(plugin, { recursive:true, force:true });
			res.send(true);
		} catch {
			res.send(false);
		}
	});
}

export async function exit() {}

const module = {
    init,
    exit,
    info: {
        id: 'pluginmanager',
        name: 'Plugin Manager Plugin',
        description: 'Endpoints to help manage SillyTavern server plugins.',
    },
};
export default module;
