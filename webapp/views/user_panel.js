// UserPanel

// require('../styles/user.css');
const UserModel = require('../models/user.js');

module.exports = Backbone.View.extend({
	id: 'UserPanel',
	className: 'container',
	template: _.template(`
		<div class="user panel panel-default">
			<div class="panel-heading" data-toggle="collapse" data-target=".user .panel-collapse">
				<div class="panel-title"><%- user.attributes.username %></div>
			</div>
			<div class="panel-collapse collapse show">
				<div class="panel-body">
					<form>
						<table>
							<% if (user.attributes.admin) { %>
								<tr> <td>Admin</td> </tr>
							<% } %>
							<tr>
								<td>Password</td>
								<td class="form-inline">
									<input type="<%- me ? 'password': 'text' %>"
										placeholder="new password"
										name="password" class="form-control"
										value="<%- user.attributes.password %>"
										autocomplete="new-password">
									<% if (me && !this.user.get('requires_reset')) { %>
										<input type="password" placeholder="current password"
											name="current_password" class="form-control"
											autocomplete="current-password">
									<% } %>
									<% if (self.has(App.Permissions.ADMIN) && !me) { %>
										<button class="btn btn-light">
											<i class="fa fa-random password"></i>
										</button>
									<% } %>
									<% if (this.user.get('requires_reset')) { %>
										<span class="text-danger">
											requires reset
											<i class="fa fa-warning" />
										</span>
									<% } %>
									<input placeholder="username" type="hidden" name="username"
										value="<%- user.get('username') %>" autocomplete="username">
								</td>
							</tr>
							<% if (me) { %>
								<tr>
									<td>Keycode</td>
									<td class="form-inline">
										<input name="keycode" min="0" max="99999999"
											placeholder="hidden" class="form-control"
											value="<%- user.attributes.keycode %>" type="number">
										<span>(8 digits, so 1 becomes 00000001)</span>
									</td>
								</tr>
							<% } %>
						</table>
					</form>
				</div>
				<div class="panel-footer">
					<input type="submit" value="Update" class="update btn btn-light">
					<span><%- updateSuccess %></span>
					<span class="text-danger"><%- updateError %></span>
					<% if (me) { %>
						<a class="btn btn-light pull-right logout" href="#">logout</a>
					<% } else if (self.attributes.admin) { %>
						<a class="btn btn-danger pull-right delete" href="#">Delete</a>
					<% } %>
				</div>
			</div>
		</div>


		<% if (!user.attributes.admin) { %>
			<div class="doors panel panel-default">
				<div class="panel-heading" data-toggle="collapse" data-target=".doors .panel-collapse">
					<div class="panel-title">Doors</div>
				</div>
				<div class="panel-collapse collapse show">
					<div class="panel-body">
						<% for (const door of doors) { %>
							<div>
								<a data-id="<%- door.id %>"
									<% if (self.attributes.admin) { %> href="#" <% } %>
									class="<%- door.allowed? 'deny': 'permit' %>">
									<span><%- door.attributes.name %></span>
									<span class="fa fa-<%- door.attributes.allowed? 'check-circle': 'ban' %>"></span>
								</a>
							</div>
						<% } %>
					</div>
				</div>
			</div>
		<% } %>

		<div class="transactions panel panel-default">
			<div class="panel-heading" data-toggle="collapse" data-target=".transactions .panel-collapse">
				<div class="panel-title">Transactions</div>
			</div>
			<div class="panel-collapse collapse"
				class="<%- transactions.length > 50? '': 'show' %>">
				<div class="panel-body">
					<table>
						<% for (const tx of transactions) { %>
							<tr>
								<td><%- lux(tx.get('creation'), 'DATE_FULL') %></td>
								<td><%- lux(tx.get('creation'), 'TIME_WITH_SHORT_OFFSET') %></td>
								<td><%- tx.attributes.amount %></td>
								<td><%- tx.attributes.currency %></td>
								<td><%- log.attributes.note %></td>
							</tr>
						<% } %>
					</table>
				</div>
				<div class="panel-footer">
					<input type="submit" value="More" class="more btn btn-light"
						disabled="<%- transactions.hasMore %>">
					<div class="error"><%- transactions.error %></div>
				</div>
			</div>
		</div>

		<div class="logs panel panel-default">
			<div class="panel-heading fetch" data-toggle="collapse" data-target=".logs .panel-collapse">
				<div class="panel-title">Logs</div>
			</div>
			<div class="panel-collapse collapse"
				class="<%- logs.length > 50? '': 'show' %>">
				<div class="panel-body">
					<table>
						<% for (const log of logs) { %>
							<tr>
								<td><%- log.attributes.service.name %></td>
								<td><%- lux(log.get('time'), 'DATE_FULL') %></td>
								<td><%- lux(log.get('time'), 'TIME_WITH_SHORT_OFFSET') %></td>
								<td><%- log.attributes.note %></td>
							</tr>
						<% } %>
					</table>
				</div>
				<div class="panel-footer">
					<input type="submit" value="More" class="more btn btn-light"
						disabled="<%- logs.hasMore %>">
					<div class="error"><%- logs.error %></div>
				</div>
			</div>
		</div>
	`),
	events: {
		'click .update': 'update',
		'click .fa-random.password': 'scramblePassword',
		'click .logout': 'logout',
		'click .delete': 'delUser',
		'click .permit': 'permit',
		'click .deny': 'deny',
		'click .transactions .toggle': 'toggleTxs',
		'click .transactions .more': 'moreTxs',
		'click .logs .toggle': 'toggleLogs',
		'click .logs .more': 'moreLogs',
	},
	initialize: function() {
		// console.log("UUU", App.Router.args, App.User.get('username'))
		const username = App.Router.args[0];
		if (username === App.User.get('username')) {
			this.user = App.User;
		} else {
			this.user = new UserModel({username: username});
			this.user.fetch({error: function() {
				App.Router.navigate('', {trigger: true});
			}});
		}

		this.doors = new (Backbone.Collection.extend({
			url: '/api/v1/doors',
		}))();
		this.doors.fetch();

		this.transactions = new (Backbone.Collection.extend({
			hasMore: true,
			url: function() {
				const lastID = this.models.length &&
					this.models[this.models.length-1].id || '';
				return '/api/v1/users/'+username+'/transactions?last_id='+lastID;
			},
		}))();
		this.moreTxs();

		this.logs = new (Backbone.Collection.extend({
			hasMore: true,
			url: function() {
				const lastID = this.models.length &&
					this.models[this.models.length-1].id || '';
				return '/api/v1/users/'+username+'/logs?last_id='+lastID;
			},
		}))();
		this.moreLogs();

		this.self = App.User;
		this.me = this.user.id === App.User.id;
		this.updateError = null;
		this.updateSuccess = null;

		this.logs.on('sync', _.bind(this.render, this));
		this.user.on('sync', _.bind(this.dingleDoors, this));
		this.doors.on('sync', _.bind(this.dingleDoors, this));
	},
	render: function() {
		if (App.Router.args[0] !== this.user.get('username'))
			return this.initialize();
		this.$el.html(this.template(this));
		return this;
	},
	dingleDoors: function() {
		if (!this.user.get('services'))
			return this.render();
		this.doors.each((d) => {
			if (_.findWhere(this.user.get('services'), {id: d.id})) {
				d.set('allowed', true);
			}
		});
		this.render();
	},
	fetch: function() {
		if (!this.logs.length) {
			this.logs.fetch();
			this.logs.hasMore = true;
		}
	},
	toggleTxs: function() {
		this.txs.open = !this.txs.open;
	},
	moreTxs: function() {
		this.transactions.fetch({ add: true, remove: false,
			success: (coll, newTxs) => {
				if (newTxs && newTxs.length < 50)
					this.transactions.hasMore = false;
			},
		});
	},
	toggleLogs: function() {
		this.logs.open = !this.logs.open;
	},
	moreLogs: function() {
		this.logs.fetch({ add: true, remove: false,
			success: (coll, newLogs) => {
				if (newLogs && newLogs.length < 50)
					this.logs.hasMore = false;
			},
		});
	},
	logout: function() {
		App.User.logout();
	},
	update: function(e) {
		e.preventDefault();
		const data = this.$('form').serializeObject();
		if (data.password === '')
			data.password = undefined;
		if (data.keycode === '')
			data.keycode = undefined;
		else
			this.user.keycode = data.keycode.toString().padStart(8, '0');
		this.updateError = null;
		this.updateSuccess = null;

		this.user.save(data, {patch: true, wait: true,
			success: () => {
				//console.log("YAY!", arguments)
				this.updateSuccess = 'Saved';
			},
			error: (m, e) => {
				//console.log("ERROR!", e)
				this.updateError = e.responseText;
			},
		});
	},
	scramblePassword: function(e) {
		e.preventDefault();
		if (confirm('Are you sure you want to scramble the password for: '
								+this.user.get('username')+'?')) {
			this.updateError = null;
			this.updateSuccess = null;
			this.user.save({password: false}, {patch: true, wait: true,
				success: function() {
					//console.log("YAY!", arguments)
					this.updateSuccess = 'Saved';
				},
			});
		}
	},
	permit: function(e) {
		const door = this.doors.find({id: this.$(e.currentTarget).data('id')});
		door.sync(null, this, {
			method: 'POST',
			url: door.url()+'/permit/'+this.user.get('username'),
		});
		door.attributes.allowed = true;
		this.render();
	},
	deny: function(e) {
		const door = this.doors.find({id: this.$(e.currentTarget).data('id')});
		door.sync(null, this, {
			method: 'DELETE',
			url: door.url()+'/permit/'+this.user.get('username'),
		});
		door.attributes.allowed = false;
		this.render();
	},
	delUser: function() {
		if (confirm('Are you sure you want to delete '+
			this.user.get('username')+'?')) {
			this.user.destroy();
			App.Router.navigate('/admin', {trigger: true});
		}
	},
});
