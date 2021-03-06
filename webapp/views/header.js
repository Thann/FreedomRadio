
require('../styles/header.css');

module.exports = Backbone.View.extend({
	id: 'Header',
	template: _.template(`
		<a href="#">
			<% if (orgName) { %>
				<span><%- orgName %> </span>
			<% } %>
			<span>Doorbot</span>
		</a>
		<% if (user.isAuthed) { %>
			<span class="pull-right">
				<% if (user.has(App.Permissions.ADMIN)) { %>
					<a href="#admin"><i class="fa fa-cogs" /></a>
				<% } %>
				<a href="#user/<%- user.get('username') %>">
					<%- user.get('username') %>
				</a>
			</span>
		<% } %>
	`),
	initialize: function() {
		this.user =  App.User,
		this.orgName = App.AppConfig.OrgName,
		this.listenTo(this.user, 'update', this.render);
	},
});
