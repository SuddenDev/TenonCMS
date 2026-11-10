# Content management language

An instance manages documents, globals and media. The same content can have published values, pending drafts and localized values.

## Language

**Document**: One identified record in a collection. Its identity stays the same across locales and publication states.

**Global**: One named set of content values, rather than a collection of identified documents.

**Draft**: Pending content that has not replaced the published values. A draft can belong to content that has never been published.

**Publish**: Make pending content available as published values after the full write checks succeed.

**Shared fields**: Values common to every locale of a localized document or global.

**Shared draft**: Pending shared field values. Publishing any locale publishes these pending values too.

**Deletion effect**: A content change required by deleting referenced content, such as clearing a reference or cascading another deletion.

**Media**: Managed files and the content records describing them. A media move changes a file's location and its describing record together.

**Job**: One queued run of a task, with a payload, a due time and a status. A job is a row in the database.

**Task**: Code that a job runs, defined with `defineTask()`. A task has a name, and its `access` rule decides who manages its jobs.

**Schedule**: A job of the built-in task `tenon:publish` or `tenon:unpublish`, queued for one document or global (and one locale) at a later time. It follows the `update` rule of its document. Needs `schedule: true` on the entry.

**Cron entry**: A cron pattern with the name of a task. It queues a job for the task at each time the pattern names.

**Lease**: The time a claimed job belongs to its runner. When the lease ends, another runner MAY claim the job again.
