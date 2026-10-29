import { defineCollection } from "tenoncms";

// Visitors comment without a session, on the post page or with `POST /_tenon/collections/comments`. They see
// approved comments only; editors and admins moderate in the list, not on the page.
export const comments = defineCollection({
  label: "Comments",
  nav: { group: "Blog", icon: "message-square" },
  titleField: "body",
  drafts: false,
  visualEditing: false,
  access: {
    create: true,
    read: ({ user }) => (user ? true : { approved: true }),
    update: ["admin", "editor"],
    delete: ["admin", "editor"],
  },
  fields: {
    post: { type: "relation", collection: "posts", required: true, onDelete: "cascade" },
    name: { type: "text", required: true, maxLength: 80 },
    body: { type: "textarea", label: "Comment", required: true, maxLength: 2000, readOnly: true },
    // A visitor's value is dropped, so a new comment waits for approval.
    approved: { type: "boolean", default: false, access: { create: ["admin", "editor"] } },
  },
});
