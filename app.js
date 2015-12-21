(function () {
    var PROJECT_STATUS_ACTIVE = 1;
    return {
        PROJECT_TO_USE: '1',
        MEMBERS: [],
        TRACKERS: [],
        PROJECTS: [],
        appID: 'RedmineAPP_IntegrationV3',
        requests: {
            getAudit: function (id) {
                return {
                    url: '/api/v2/tickets/' + id + '/audits.json',
                    type: 'GET',
                    contentType: 'application/json',
                    dataType: 'json'
                };
            },
            updateTicket: function (id, data) {
                return {
                    url: '/api/v2/tickets/' + id + '.json',
                    type: 'PUT',
                    data: data,
                    dataType: 'json',
                    contentType: 'application/json'
                };
            },
            postRedmine: function (project, redmine_url, data) {
                return {
                    url: redmine_url + '/issues.json?key={{setting.apiKey}}',
                    type: 'POST',
                    dataType: 'json',
                    data: data,
                    secure: true
                };
            },
            getProjects: function (redmine_url) {
                return {
                    url: redmine_url + '/projects.json?key={{setting.apiKey}}&limit=100',
                    type: 'GET',
                    dataType: 'json',
                    secure: true
                };
            },
            getIssue: function (redmine_url, issue_id) {
                return {
                    url: redmine_url + '/issues/' + issue_id + '.json?key={{setting.apiKey}}',
                    type: 'GET',
                    dataType: 'json',
                    secure: true
                };
            },
            getTrackers: function (redmine_url) {
                return {
                    url: redmine_url + '/projects/' + this.PROJECT_TO_USE + '.json?key={{setting.apiKey}}&include=trackers',
                    type: 'GET',
                    dataType: 'json',
                    secure: true
                };
            },
            getMembers: function (redmine_url) {
                return {
                    url: redmine_url + '/projects/' + this.PROJECT_TO_USE + '/memberships.json?key={{setting.apiKey}}',
                    type: 'GET',
                    dataType: 'json',
                    secure: true
                };
            }
        },
        events: {
            'app.activated': 'onActivated',
            'postRedmine.done': 'result',
            'click #submitToRedmine': 'prep_to_post',
            'getProjects.done': 'listProjects',
            'getAudit.done': 'listIssues',
            'click .js-project': 'projectSelect',
            'updateTicket.done': 'reset',
            'click .issue': 'get_issue',
            'getIssue.done': 'show_issue',
            'click .back_button': 'onActivated',

            'click .nav-pills .js-projects': function () {
                this.setActivePill('js-projects');
                this.ajax('getProjects', this.settings.redmine_url);
            },
            'click .nav-pills .js-issues': function () {
                this.setActivePill('js-issues');
                this.ajax('getAudit', this.ticket().id());
            }
        },
        setActivePill: function (itemClass) {
            this.$('.nav-pills li').removeClass('active');
            this.$('.nav-pills li.' + itemClass).addClass('active');
        },
        renderError: function (error_text) {
            services.notify(error_text, 'error');
            this.switchTo('error', {error: error_text});
        },
        onActivated: function () {
            console.log('ZDRedmine loaded');

            // Remove trailing slash from redmine_url
            if (this.settings.redmine_url.search('\/$') != -1) {
                this.settings.redmine_url = this.settings.redmine_url.slice(0, -1);
            }

            this.doneLoading = false;
            this.loadIfDataReady();
        },
        loadIfDataReady: function () {
            if (!this.doneLoading && this.ticket().status() != null && this.ticket().requester().id()) {
                this.doneLoading = true;
                this.ajax('getAudit', this.ticket().id());
            }
        },
        result: function (result) {
            services.notify(this.I18n.t('issue.posted'));
            var id = result.issue.id;
            var data = {
                "ticket": {
                    "comment": {
                        "public": false,
                        "value": "This ticket was pushed to Redmine\n\n" + this.settings.redmine_url + "/issues/" + id + "\n\n"
                    }, "metadata": {"pushed_to_redmine": true, "redmine_id": id}
                }
            };
            data = JSON.stringify(data);
            this.ajax('updateTicket', this.ticket().id(), data);
        },
        listProjects: function (data) {
            if (data == null) {
                this.renderError("No data returned. Please check your API key.");
            } else {

                // Only show active projects and sort by name
                data.projects = data.projects.filter(function (project) {
                    return project.status === PROJECT_STATUS_ACTIVE;
                }).map(function (project) {
                    // Prefix parent project's name
                    if (project.hasOwnProperty('parent')) {
                        project.name = project.parent.name + ' - ' + project.name;
                    }
                    return project;
                }).sort(function (a, b) {
                    if (a.name.toLowerCase() < b.name.toLowerCase()) return -1;
                    if (a.name.toLowerCase() > b.name.toLowerCase()) return 1;
                    return 0;
                });

                this.PROJECTS = data;

                this.switchTo('projectList', {project_data: data});
            }
        },
        prep_to_post: function () {
            var subject = this.$('#rm_subject').val();
            var tracker = this.$('#rm_tracker').val();
            var priority = this.$('#rm_priority').val();
            var asignee = this.$('#rm_assignee').val();
            if (subject.length < 1) {
                services.notify('You must include a subject.', 'error');
            } else {
                var ticket_desc = this.ticket().description();
                ticket_desc = ticket_desc.replace(/&/gim, '').replace(/</gim, '').replace(/>/gim, '').replace(/:/gim, '');
                var data = {
                    "issue": {
                        "subject": subject,
                        "project_id": this.PROJECT_TO_USE,
                        "tracker_id": tracker,
                        "assigned_to_id": asignee,
                        "description": "This issue was pushed from Zendesk to Redmine.\n---\n\n" + this.$('#rm_note').val() + "\n\nTicket URL: https://" + this.currentAccount().subdomain() + ".zendesk.com/tickets/" + this.ticket().id() + "\n\n"
                    }
                };
                this.ajax('postRedmine', this.settings.project, this.settings.redmine_url, data);
            }
        },
        projectSelect: function (e) {
            this.PROJECT_TO_USE = e.target.id;
            var doneRequests = 0;
            this.ajax('getTrackers', this.settings.redmine_url)
                .done(function (data) {
                    this.TRACKERS = data.project;
                }.bind(this))
                .always(function () {
                    doneRequests++;
                });

            this.ajax('getMembers', this.settings.redmine_url)
                .done(function (data) {
                    var members = [];
                    data.memberships.forEach(function (membership) {
                        members.push(membership.user);
                    });
                    this.MEMBERS = members;
                }.bind(this))
                .always(function () {
                    doneRequests++;
                });

            var interval = setInterval(function () {
                if (doneRequests == 2) {
                    clearTimeout(interval);
                    this.switchTo('newIssue', {trackers: this.TRACKERS, members: this.MEMBERS});
                }
            }.bind(this), 500);
        },
        listIssues: function (data) {
            var ticketHasIssue = false;
            var issueList = [];
            for (var i = 0; i <= data.count; i++) {
                try {
                    var redmine_meta = data.audits[i].metadata.custom;
                    if (redmine_meta.pushed_to_redmine) {
                        ticketHasIssue = true;
                        issueList.push(redmine_meta.redmine_id);
                    }
                } catch (err) {
                }
            }

            if (ticketHasIssue) {
                this.switchTo('issueList', {issues: issueList});
            } else {
                this.switchTo('projectList', {project_data: this.PROJECTS});
            }
        },
        reset: function () {
            this.ajax('getProjects', this.settings.redmine_url);
        },
        get_issue: function (e) {
            var issue_id = e.target.dataset.id;
            this.ajax('getIssue', this.settings.redmine_url, issue_id);
        },
        show_issue: function (data) {
            this.switchTo('show_issue', {
                issue: data.issue,
                url: this.settings.redmine_url + "/issues/" + data.issue.id
            });
        }
    };
}());    