// AdminPanel

module.exports = Backbone.View.extend({
	id: 'AdminPanel',
	className: 'container',
	template: `
		Doors:
		<div class="doors">
			<form>
				<input rv-show="creatingDoor" type="text" name="name" placeholder="Name" required>
				<input rv-show="creatingDoor" type="submit" class="new btn btn-default">
				<div class="error" rv-text="error"></div>
			</form>
			<button rv-hide="creatingDoor" class="btn btn-default new">New</button>
		</div>

		<div rv-each-door="doors">
			<span rv-text="door:name"></span>
			<span rv-hide="door:available" rv-text="door:token"></span>
			<span rv-show="door:available" class="fa fa-check-circle"></span>
			<button class="btn btn-default edit-door" rv-data-id="door:id">edit</button>
		</div>

		<br>
		<div class="users">
			Users:
			<form>
				<input rv-show="creatingUser" type="text" name="name" placeholder="Name" required>
				<input rv-show="creatingUser" type="submit" class="new btn btn-default">
				<div class="error" rv-text="error"></div>
			</form>
			<button rv-hide="creatingUser" class="btn btn-default new">New</button>

			<div rv-each-user="users">
				<a rv-href="'#user/' |+ user:username" rv-text="user:username"></a>
				<span rv-text="user:password"></span>
				<span rv-text="user.doors"></span>
			</div>
		</div>
	`,
	events: {
		'click .edit-door': 'editDoor',
		'click .doors .new': 'createDoor',
		'click .users .new': 'createUser',
	},
	initialize: function() {
		if (!Doorbot.User.get('admin')) {
			console.log("NOT ADMIN!!")
			return Doorbot.Router.navigate('', {trigger: true});
		}

		this.doors = new (Backbone.Collection.extend({
			url: 'doors',
		}))();
		this.doors.on('sync', _.bind(function() {
			if (this.users) { this.users.fetch(); }
			//TODO: render should not be nessicary
			this.render();
		}, this));
		this.doors.fetch();

		this.users = new (Backbone.Collection.extend({
			url: 'users'
		}))();
		this.users.on('sync', _.bind(function(coll) {
			// Turn door numbers into names
			if (coll.each)
			coll.each(_.bind(function(user) {
				user.doors = [];
				const permitted = ','+user.get('doors')+',';
				this.doors.each(_.bind(function(d) {
					if (permitted.indexOf(','+d.id+',') >= 0)
						user.doors.push(d.get('name'));
				}, this));
			}, this));
			//TODO: render should not be nessicary
			this.render();
		}, this));
	},
	render: function(){
		console.log("RENDER MAIN:", Doorbot.User.get('admin'))
		this.scope = {
			doors: this.doors,
			users: this.users,
		};
		this.$el.html(this.template);
		Rivets.bind(this.$el, this.scope);
		return this;
	},
	createDoor: function(e) {
		if (e) e.preventDefault();
		var self = this;
		console.log("CREEATING DOOR:", this.scope.creatingDoor);
		if (!this.scope.creatingDoor) {
			this.scope.creatingDoor = true;
			self.scope.error = undefined;
		} else {
			this.doors.create({
				name: this.$('.doors form [name="name"]').val()
			}, {wait: true,
				success: function() {
					console.log("DOOR CREATE DONE!", self.doors)
					self.scope.creatingDoor = false;
					// self.render()
				},
				error: function(m, resp) {
					console.warn("DOOR CREATE ERR!", resp.responseText)
					self.scope.error = resp.responseText;
				}
			});
		}
	},
	editDoor: function(e) {
		// var id = $(e.currentTarget).data('id');
		// if (!this.scope.editingDoor) {
		// 	this.scope.editingDoor = id;
		// 	self.scope.error = undefined;
		// } else {
		// 	var door = this.doors.find({id: id});
		// 	// door.sync(null, this, {url: door.url()+'/open', method: 'POST'});
		// }
	},
	deleteDoor: function() {
		this.doors.find({id: $(e.currentTarget).data('id')}).destroy();
	},
	createUser: function(e) {
		if (e) e.preventDefault();
		var self = this;
		if (!this.scope.creatingUser) {
			this.scope.creatingUser= true;
			self.scope.error = undefined;
		} else {
			this.users.create({
				username: this.$('.users form [name="name"]').val()
			}, {wait: true,
				success: function() {
					console.log("DOOR CREATE DONE!", self.doors)
					self.scope.creatingDoor = false;
				},
				error: function(m, resp) {
					console.warn("USER CREATE ERR!", resp.responseText)
					self.scope.error = resp.responseText;
				}
 			});
		}
	},
});