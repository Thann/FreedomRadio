// REST API for doors.
'use strict';

const db = require('../lib/db');
const crypto = require('crypto');
const users = require('./users');
const errors = require('../lib/errors');
const Perms = require('../lib/permissions');
const DOOR_SOCKETS = {};

module.exports = function(app) {
	app.   get('/doors', index);
	app.  post('/doors', create);
	app.    ws('/doors', connect);
	app.   get('/doors/:id', read);
	app. patch('/doors/:id', update);
	app.delete('/doors/:id', remove);
	app.   get('/doors/:id/logs', logs);
	app.  post('/doors/:id/open', open);
	app.  post('/doors/:id/permit/:username', permit);
	app.delete('/doors/:id/permit/:username', deny);
};

async function index(request, response) {
	const user = await users.checkCookie(request, response);
	let doors;
	// TODO: formalize permissions
	if (user.has(Perms.ADMIN)) {
		doors = await db.all('SELECT * FROM services');
	} else {
		doors = await db.all(`
			SELECT services.* FROM services
			INNER JOIN permissions ON services.id = permissions.service_id
			WHERE permissions.user_id = ? AND type = 'door' AND
				(services.deleted_at IS NULL OR services.deleted_at > CURRENT_TIMESTAMP)`,
			user.id);
	}

	const doorList = [];
	for (const door of doors) {
		doorList.push({
			id: door.id,
			name: door.name,
			token: user.has(Perms.ADMIN) ? door.token : undefined,
			available: DOOR_SOCKETS[door.id] && (
				DOOR_SOCKETS[door.id].readyState === 1),
		});
	}
	response.send(doorList);
}

async function create(request, response) {
	if (!request.body.name) {
		return response.status(400).send({name: 'required'});
	}

	const user = await users.checkCookie(request, response);
	if (!user.has(Perms.ADMIN)) {
		return response.status(403).send({error: 'must be admin'});
	}

	const token = crypto.createHash('sha256')
		.update(Math.random().toString()).digest('hex');
	let sqlResp;
	try {
		sqlResp = await db.run('INSERT INTO services (name, token, type) VALUES (?,?,"door")',
			request.body.name, token);
	} catch(e) {
		return response.status(400).send({name: 'already taken'});
	}

	response.send({
		id: sqlResp.stmt.lastID,
		name: request.body.name,
		token: token,
	});
}

async function read(request, response) {
	const user = await users.checkCookie(request, response);
	let door;
	if (user.has(Perms.ADMIN)) {
		door = await db.get(
			'SELECT * FROM services WHERE type = "door" AND id = ?', request.params.id);
	} else {
		door = await db.get(`
			SELECT services.* FROM services
			INNER JOIN permissions ON services.id = permissions.service_id
			WHERE permissions.user_id = ? AND services.id = ? AND services.type = 'door'`,
			user.id, request.params.id);
	}

	if (!door) {
		return response.status(404).end();
	}

	response.send({
		id: door.id,
		name: door.name,
		token: user.has(Perms.ADMIN) ? door.token : undefined,
	});
}

async function update(request, response) {
	if (!request.body.name) {
		return response.status(400).send({name: 'required'});
	}

	const user = await users.checkCookie(request, response);
	if (!user.has(Perms.ADMIN)) {
		return response.status(403).send({error: 'must be admin'});
	}

	try {
		await db.run('UPDATE services SET name = ? WHERE id = ? AND type = "door"',
			request.body.name, request.params.id);
	} catch(e) {
		return response.status(400).send({error: 'DB update error'});
	}

	const door = await db.get(
		'SELECT * FROM services WHERE id = ? AND type = "door" AND deleted_at IS NULL',
		request.params.id);
	response.send({
		id: door.id,
		name: door.name,
		token: user.has(Perms.ADMIN) ? door.token : undefined,
	});
}

async function remove(request, response) {
	const user = await users.checkCookie(request, response);
	if (!user.has(Perms.ADMIN)) {
		return response.status(403).send({error: 'must be admin'});
	}
	//TODO: paranoid delete instead?
	const r = await db.run(`
		UPDATE services SET deleted_at = CURRENT_TIMESTAMP
		WHERE id = ? AND type = "door"`,
		request.params.id);
	response.status(r.stmt.changes? 204 : 404).end();
}

async function logs(request, response) {
	const user = await users.checkCookie(request, response);
	if (!user.has(Perms.ADMIN)) {
		return response.status(403).send({error: 'must be admin'});
	}

	let lastID;
	// console.log("params", request.query);
	try {
		lastID = parseInt(request.query.last_id);
	} catch(e) {
		return response.status(400).send({last_id: 'must be an int'});
	}

	const logs = await db.all(`
		SELECT service_logs.*, users.username, users.deleted_at FROM service_logs
		INNER JOIN users ON service_logs.user_id = users.id
		WHERE service_id = ? AND service_logs.id < COALESCE(?, 9e999)
		ORDER BY service_logs.id DESC LIMIT ?`,
		request.params.id, lastID, 50);

	// response.send(logs);
	const logList = [];
	for (const log of logs) {
		logList.push({
			id: log.id,
			time: log.time,
			method: log.note,
			user_id: log.user_id,
			door_id: log.service_id,
			username: log.username,
			deleted_at: null,
		});
	}
	response.send(logList);
}

async function open(request, response) {
	const user = await users.checkCookie(request, response);
	if (!user.has(Perms.ADMIN)) {
		if (!user.pw_salt) {
			return response.status(422).send({error:
				'your password has been set by an admin and requires reset'});
		}

		// TODO: ensure service is a door
		const perm = await db.get(`
			SELECT * FROM permissions
			INNER JOIN services ON permissions.service_id = services.id
			WHERE service_id = ? AND user_id = ?
				AND (expiration IS NULL OR expiration < CURRENT_TIMESTAMP)
				AND (services.deleted_at IS NULL OR services.deleted_at < CURRENT_TIMESTAMP)`,
			request.params.id, user.id);

		if (!perm) {
			return response.status(403).send({error:
				'you dont have permissions to open this door.'});
		}
	}

	const method = 'web:' + (request.headers['x-forwarded-for'] ||
							request.connection.remoteAddress);

	//TODO: check constraints
	await _openDoor(user.id, request.params.id, method, response);

	response.status(204).end();
}

async function _openDoor(userId, doorId, method, response) {
	try {
		if (process.env.NODE_ENV !== 'test')
			DOOR_SOCKETS[doorId].send('open');
	} catch(e) {
		console.warn('ERROR: could not open door:', e);
		response.status(503).send({error: 'door could not be opened'});
		throw new errors.HandledError();
		//TODO: error.UserError(...)
	}

	await db.run(
		'INSERT INTO service_logs (user_id, service_id, note) VALUES (?,?,?)',
		userId, doorId, method);
}

async function connect(ws, request, next) {
	if (!request.headers.authorization) {
		return ws.close(1007, 'no token');
	}
	const door = await db.get(`
		SELECT * FROM services
		WHERE token = ? AND type = "door" AND deleted_at < CURRENT_TIMESTAMP`,
		request.headers.authorization);

	if (!door) {
		return ws.close(1007, 'bad token');
	}

	ws.on('message', async function(msg) {
		msg = msg.split(':', 2);
		if (msg[0] === 'keycode') {
			const user = await db.get(`
				SELECT permissions.*, users.* FROM users
				LEFT JOIN permissions ON users.id = permissions.user_id
					AND permissions.service_id = ?
				WHERE keycode = ? AND deleted_at IS NULL`,
				door.id, msg[1]);

			//TODO: check constraints
			const userPerms = new Perms(user.admin);
			if (user && (userPerms.has(Perms.ADMIN) || user.door_id))
				_openDoor(user.id, door.id, 'keycode');
		}
	});

	DOOR_SOCKETS[door.id] = ws;
}

async function permit(request, response) {
	const user = await users.checkCookie(request, response);
	if (!user.has(Perms.ADMIN)) {
		return response.status(403).send({error: 'must be admin'});
	}

	const door = await db.get(`
		SELECT * FROM services
		WHERE id = ? AND type = "door"
			AND (deleted_at IS NULL OR deleted_at > CURRENT_TIMESTAMP)`,
		request.params.id);
	if (!door) {
		return response.status(404).send({error: "door doesn't exist"});
	}

	//TODO: validate constraints, creation, expiration

	let sqlResp;
	try {
		sqlResp = await db.run(`
			INSERT OR REPLACE INTO permissions
				(user_id, service_id, creation, expiration, constraints)
			SELECT users.id, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?
			FROM users WHERE username = ? AND deleted_at IS NULL`,
			request.params.id, request.body.creation, request.body.expiration,
			request.body.constraints, request.params.username);
	} catch(e) {
		//TODO: check error
		console.warn('PERMIT ERROR', e);
	}
	if (!sqlResp.changes) {
		return response.status(404).send({error: "user doesn't exist"});
	}

	response.status(200).send({
		door_id: request.params.id,
		username: request.params.username,
		expiration: request.body.expiration,
		constraints: request.body.constraints,
	});
}

async function deny(request, response) {
	const user = await users.checkCookie(request, response);
	if (!user.has(Perms.ADMIN)) {
		return response.status(403).send({error: 'must be admin'});
	}

	const r = await db.run(`
		UPDATE permissions SET expiration = CURRENT_TIMESTAMP
		WHERE service_id = ? AND expiration IS NULL AND user_id IN
			( SELECT id FROM users WHERE username = ? AND deleted_at IS NULL )`,
		request.params.id, request.params.username);

	if (!r.stmt.changes) {
		response.status(404).send({error: "door doesn't permit user"});
	} else {
		response.status(204).end();
	}
}
