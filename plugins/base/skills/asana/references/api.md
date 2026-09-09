# Asana API notes

These links are the authority for API behavior. Check them when changing a request.

- [Update a task](https://developers.asana.com/reference/updatetask): PUT
  `/tasks/{gid}` with `{"data":{"completed":true}}` updates only that field.
- [Get a story](https://developers.asana.com/reference/getstory): GET
  `/stories/{gid}`; request `target.gid` to check the parent task.
- [Create a story](https://developers.asana.com/reference/createstoryfortask):
  POST `/tasks/{gid}/stories` with plain `text` or XML-wrapped `html_text`.
- [Rich text and mentions](https://developers.asana.com/docs/rich-text):
  `<body>Message <a data-asana-gid="USER_GID"/></body>` produces an actual mention.
  There is no separate generic `mentions` parameter for this request.
- [Add followers](https://developers.asana.com/reference/addfollowersfortask):
  POST `/tasks/{gid}/addFollowers` with `{"data":{"followers":["USER_GID"]}}`.
  For notification, ensure the user is assigned or following before posting.
  After adding followers, wait a few seconds before creating the story.
- [Get an attachment](https://developers.asana.com/reference/getattachment):
  fetch a fresh `download_url` before downloading. Some external attachments
  have no direct download URL. Follow the linked provider instead.
- [Delete a story](https://developers.asana.com/reference/deletestory):
  deletion exists, subject to access. It cannot undo an already sent notification.

The helper verifies saved task completion and saved comment content. It does not
claim that an email or an inbox notification was delivered to another person.

## Account and fork checks

If a project has a local Asana skill or sync helper, inspect it before replacing
anything. Keep intentional project behavior. Prefer a small reference to this
installed helper instead of maintaining another full copy. Confirm the installed
base pack version in a new task; a catalog refresh alone does not load new files.
