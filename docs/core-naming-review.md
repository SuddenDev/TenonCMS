# Core naming review

- The worst names hide an action, a return value, or the difference between two similar helpers.
- `Inner` is the biggest case: it is the context of a running operation, including the CMS API that hooks receive. `OperationContext` says that.
- This is a list of suggestions. No source was renamed.

Basis: the working tree on 2026-10-27, all 554 code files under `packages/core`. `pnpm typecheck` passed. This is a naming review, not a correctness or security audit. Names marked **public** are package exports, so a rename is an API change.

## What `Inner` means

`Inner` (`cms/runtime/types.ts`) is `Scope & { cms: LocalApi }`.

- `Scope` carries the user, transaction, locale, read perspective, access setting and the object that hooks share.
- `Inner` adds a CMS API bound to that scope. Operations use it for hooks and nested calls. Reads use it too, so it does not always hold a transaction.
- The API given to hooks skips access rules. The surrounding context keeps the caller's own access setting.

```ts
type CallScope = {/* settings and state carried by a CMS call */};
type OperationContext = CallScope & { cms: LocalApi };
```

`HookContext` would be too narrow. `TransactionContext` would suggest a transaction always exists.

## Rename first

| Current                                                   | Suggested                         | Why                                                      |
| --------------------------------------------------------- | --------------------------------- | -------------------------------------------------------- |
| `Inner`                                                   | `OperationContext`                | "Inner" says nothing about what is inside                |
| `inner()`                                                 | `createOperationContext()`        | Builds the context and the API hooks use                 |
| `slot()`                                                  | `collectHooks()`                  | Gathers collection, plugin and root hooks for a stage    |
| `read()`                                                  | `readDocuments()`                 | Checks access, queries, runs the read pipeline           |
| `readDocs()`                                              | `processReadResults()`            | Works on already loaded documents; runs no initial query |
| `writable()`                                              | `requireWritableCollection()`     | Throws for unknown collections and direct media writes   |
| `placeFile()`                                             | `chooseUploadLocation()`          | Picks folder and name; does not store bytes              |
| `hasVariants()`                                           | `canGenerateVariants()`           | Checks the image allows variants, not that any exist     |
| `readMedia()`                                             | `addMediaUrls()`                  | Adds URLs to a record; loads nothing                     |
| `Row` (`local-api.ts`)                                    | `UntypedDocument`                 | A plain document, not a database row                     |
| `Request` (`client/create-request.ts`)                    | `CmsRequestFunction`              | Not the browser `Request`                                |
| `guard()`, `permit()`, `decide()`, `check()`, `enforce()` | See [Access rules](#access-rules) | Different amounts of work; the names hide it             |

## CMS runtime and operations

| Current                          | Suggested                                                          | Why                                                         |
| -------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `Core`, `core`                   | `CmsRuntime`, `runtime`                                            | Shared config and services of one CMS                       |
| `Scope`                          | `CallScope`                                                        | Settings and state of one call                              |
| `Stage`                          | `HookStage`                                                        | `beforeChange`, `afterRead`, and so on                      |
| `outerScope()`                   | `createCallScope()`                                                | Starts a scope from server code or HTTP                     |
| `contextOf()`                    | `hookContextForCall()`                                             | Reuses hook data for nested calls, creates it for outer     |
| `transaction()`                  | `runInTransaction()`                                               | Joins or starts a transaction, handles commit and rollback  |
| `Effect`, `commit`, `rollback`   | `TransactionCallback`, `afterCommitCallbacks`, `rollbackCallbacks` | They are callbacks, not methods that finish the transaction |
| `outside()`                      | `contextWithoutTransaction()`                                      | Context for commit or rollback work                         |
| `trackWrite()`                   | `markTransactionOnWriteFailure()`                                  | A failure blocks the commit even if a caller catches it     |
| `of()`, `body()` (run-operation) | `hooksForStage()`, `executeOperation()`                            | Select hooks; run the operation                             |
| `createRuntime()`, `Session`     | `createDatabaseAndAuth()`, `AuthSessionApi`                        | Builds lazy DB and auth; `Session` is an API, not a record  |
| `Options` (`local-api.ts`)       | `LocalReadOptions`                                                 | Filter, populate, select and locale options                 |

## Access rules

| Current                          | Suggested                                                         | Why                                                               |
| -------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `check()`                        | `evaluateAccessRule()`                                            | Returns the decision; does not throw                              |
| `decide()`                       | `evaluateOperationAccess()`                                       | Picks the rule, applies defaults and override                     |
| `permit()`                       | `requireOperationAccess()`                                        | Rejects an outright denial; a filter still has to be applied      |
| `enforce()`                      | `enforceAccessDecision()`                                         | Throws unless allowed or the filter matches the document          |
| `guard()`                        | `requireDocumentAccess()`                                         | Evaluates, then loads the document if a filter needs it           |
| `guardAll()`                     | `requireUnrestrictedAccess()`                                     | Needs an outright allow; a filter is not enough                   |
| `Op`, `PRIVATE`, `matches()`     | `AccessOperation`, `SIGNED_IN_READ_RULE`, `matchesAccessFilter()` | Name the operation, the private-field rule, the filter check      |
| `readAccess()`, `readable()`     | `requirePublishedReadAccess()`, `canReadPublishedDocument()`      | Published-only; `readable()` can still throw                      |
| `admittedRows()`, `admitsRead()` | `filterReadableDocuments()`, `matchesReadAccess()`                | "Admit" is another word for access                                |
| `stripDenied()`, `dropDenied()`  | `stripUnreadableFields()`, `filterUnwritableInput()`              | First edits read results; second copies input and restores values |
| `checkReadWhere()`               | `validateReadFilters()`                                           | Field exists, is filterable and readable                          |

## Content: reads, writes, references, locales

| Current                                                      | Suggested                                                                                    | Why                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `target()`, params named `name` of `ContentTarget`           | `getContentDefinition()`, `target`                                                           | The object holds kind and name; `name.name` reads badly      |
| `known()`, `draftable()`                                     | `requireKnownTarget()`, `requireDraftsEnabled()`                                             | They throw; they are not predicates                          |
| `locOf()`                                                    | `localeReadOptions()`                                                                        | Builds locale settings, fallback and localized keys          |
| `readPlan()`                                                 | `prepareReadOptions()`                                                                       | Builds the populate plan and validates `select`              |
| `step()`                                                     | `planForField()`                                                                             | Decides if a field resolves and which plan it continues with |
| `Hop`, `hop()`                                               | `PopulationContext`, `processRelatedDocuments()`                                             | State and work for one relation level                        |
| `ReadHooks`                                                  | `PopulationReadContext`                                                                      | Holds access, locale, draft mode, media and hooks            |
| `pick()`, boolean `meta`                                     | `selectFields()`, `keepId`                                                                   | The boolean keeps `id`, not all metadata                     |
| `source`, `sourceData`, `originalDoc`                        | `storedSource`, `sourceValues`, keep `originalDoc`                                           | Three different things; the names blur them                  |
| `loose`, `valid`, `copy` (prepare-data)                      | `typeChecksOnly`, `parsedData`, `mergedInput`                                                | `valid` is set before custom validation runs                 |
| `Ref`, `references()`                                        | `StoredReference`, `findReferencesTo()`                                                      | Fields elsewhere that point to a document                    |
| `owner()`, `row()` (find-references)                         | `referenceOwnerKey()`, `referenceRowKey()`                                                   | They return dedupe keys, not objects                         |
| `Effects`, `onDelete()`, `clear()`, `rule()`                 | `DeletionActions`, `applyDeletionEffects()`, `clearDeletedReferences()`, `deletionRuleFor()` | `onDelete()` runs the rules; it registers nothing            |
| `copyLocalized()`, `removeLocalized()`, `discardLocalized()` | `copyLocaleValues()`, `removeLocaleValues()`, `discardLocalizedDrafts()`                     | Say what moves, goes or is dropped                           |

## Schema: types, traversal, validation

| Current                                    | Suggested                                                                        | Why                                                      |
| ------------------------------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `Common`, `Base`                           | `CommonFieldOptions`, `StoredFieldOptions`                                       | Options for all fields; extra options for stored fields  |
| `Fn`, `Slot`                               | `HookFunction`, `HookList`                                                       | Keep the method syntax when renaming                     |
| `Sub`, `Next`, `Off`, `Prev`               | `FieldPopulateSpec`, `NextPopulateSpec`, `IsPopulationDisabled`, `PreviousDepth` | Match the runtime plan vocabulary                        |
| `Wide`                                     | `HasUntypedCollections`                                                          | Stops recursive type expansion on untyped schemas        |
| `Target`, `Targets`                        | `PopulatedDocument`, `PopulatedReferenceValue`                                   | One related document; the one-or-many value              |
| `Ids`                                      | `ReferenceIds`                                                                   | String for a single reference, array for `many`          |
| `File`, `Image` (**public**)               | `MediaFile`, `MediaImage`                                                        | Populated media records, not browser objects             |
| `innerFields()`                            | `nestedFields()`                                                                 | Unrelated to the runtime's `Inner`                       |
| `Holder`, `holdersAt()`, `at`              | `FieldLocation`, `fieldLocationsAtPath()`, `valuePath`                           | Parent object and key of each matching value             |
| `Each`, `Step`                             | `ArrayItemsStep`, `FieldPathStep`                                                | Follow a key, or visit every array or block item         |
| `relationPaths()`, `isRef()`, `targetOf()` | `referencePaths()`, `isReferenceField()`, `referenceCollection()`                | Fields that store ids, including images and files        |
| `pathKey()`, `plainPath()`                 | `formatFieldPath()`, `objectPathOrUndefined()`                                   | Format `links[].page`; dot path only without array steps |
| `dataSchema()`, `fieldEntry()`, `on`       | `buildDataSchema()`, `buildFieldSchema()`, `isActive`                            | They build validators; `on` means the condition matches  |
| `loose` (parse-data)                       | `typeChecksOnly`                                                                 | Use the same term as the write pipeline                  |

## Database

| Current                                | Suggested                                                                  | Why                                        |
| -------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| `Loc`                                  | `LocaleReadOptions`                                                        | An options object, not a locale string     |
| `LocaleOwner`                          | `LocaleTable`                                                              | Picks the locale table and its key column  |
| `dataOf()`, `visible()`, `holdsAt()`   | `dataExpression()`, `visibilityCondition()`, `referenceMatchCondition()`   | They return SQL, not data or booleans      |
| `SHARED_DRAFT`                         | `sharedDraftExpression()`                                                  | Looks like a constant but is a function    |
| `Meta`, `localized()`, `own`           | `ContentRowData`, `mergeLocaleRow()`, `metadataLocalePrefix`               | `Meta` includes the content data           |
| `withMeta()`                           | `decodeContentRow()`                                                       | Parses JSON, merges locales, adds metadata |
| `syncLocalized()`, `shift()`, `move()` | `syncLocalizedFieldStorage()`, `moveVersionFields()`, `moveStoredFields()` | Move values between shared and locale rows |

## Media

| Current                                       | Suggested                                                              | Why                                                                                     |
| --------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `MediaCore`, `mediaOf()`                      | `MediaRuntime`, `requireMedia()`                                       | `mediaOf()` throws when media is off                                                    |
| `Images`, `Variant`                           | `ResolvedImageOptions`, `SrcsetVariant`                                | Options with defaults; one responsive entry                                             |
| `Place`, `placeOf()`, `cleanPlace()`          | `FileLocation`, `updatedFileLocation()`, `cleanUploadLocation()`       | Folder, filename and storage key                                                        |
| `checkFree()`, `namesIn()`                    | `requireAvailableFilename()`, `usedFilenamesInFolder()`                | Reject a clash; list names in use                                                       |
| upload `Row`, `DAY`, `findUpload()`           | `UploadRow`, `UPLOAD_TTL_MS`, `findOwnedActiveUpload()`                | Unit in the name; owner and expiry in the lookup                                        |
| `partsOf()`                                   | `partCount()`                                                          | Returns a number                                                                        |
| `fileData()`, `HEADER`                        | `validateUploadedFile()`, `IMAGE_HEADER_BYTES`                         | Checks size and header, builds the record values                                        |
| `discard()` (abort.operation)                 | `cleanupFailedUpload()`                                                | Unrelated to discarding a content draft                                                 |
| `create()`, `complete()`, `abort()` (uploads) | `createUpload()`, `completeUpload()`, `abortUpload()`                  | Imported as plain functions; lose context at the call site                              |
| `decorate()`                                  | `addMediaUrls()`                                                       | Adds original, display and srcset URLs; pairs with `readMedia()`, so avoid a third name |
| `SHORT`, `LONG`, `NUMERIC`                    | `MODIFIER_SHORT_NAMES`, `MODIFIERS_BY_SHORT_NAME`, `INTEGER_MODIFIERS` | Map modifier names to URL abbreviations and back                                        |
| `variantsOf()`, `renderAll()`                 | `storedVariantIds()`, `renderVariants()`                               | List stored ids; render and count                                                       |
| `rfc3986()`, `tag()`                          | `encodeS3PathSegment()`, `xmlTagText()`                                | S3 signing and XML helpers                                                              |
| `Request`, `ok` (s3 client)                   | `S3RequestOptions`, `acceptedStatuses`                                 | Not a platform `Request`; `ok` is a status list                                         |

## Admin and preview

| Current                                          | Suggested                                                                   | Why                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| `load()`, `Request`, `registered()` (admin/load) | `loadAdminExtension()`, `LoadRequestOfKind`, `requireRegisteredLoader()`    | Dispatch, narrow, fetch or 404                         |
| `isRef()`, `requireRef()` (admin)                | `isClientReference()`, `requireClientReference()`                           | `clientRef()` values; not schema relations             |
| `Applied`, `run` (bar-item)                      | `BarItemLoadResult`, `loadResult`                                           | `run` is a result, not a function                      |
| `isNative()`, `plain()`                          | `isLinkOrDropdown()`, `toClientBarItem()`                                   | "Native" does not name the two kinds                   |
| `keepsChildren()`                                | `usesRegisteredChildren()`                                                  | Whether their own loaders still run                    |
| `toJson()`                                       | `copyJsonValue()`                                                           | Validates and copies; returns a value, not text        |
| two types named `AdminBar`                       | `AdminBarConfig`, `AdminBarHandle`                                          | Server config vs browser `stop()` and `setEdit()`      |
| `edit()` (**public**)                            | `fieldBinding()`                                                            | Builds a `data-cms` string; edits nothing              |
| `patch()`, `patchAll()`, `pickBound()`           | `applyDraftToElement()`, `applyDraftsToElements()`, `findEditableElement()` | Apply unsaved values; find the clicked element         |
| `merge()` (**public**), `now`                    | `mergePreviewDraft()`, `currentItem`                                        | `now` is not a time                                    |
| `createRerender()`                               | `createPageRefresher()`                                                     | Fetches the page and updates the DOM, one at a time    |
| `fillItems()`, `forget()`                        | `fillBuiltInLinks()`, `removeItemData()`                                    | Fill dashboard and edit links; drop cached loader data |
| `hop()`, `where` (resolve-url)                   | `resolveTemplateRelation()`, `localeOptions`                                | `where` is not a query filter here                     |

## Rich text, adapters, auth, client, helpers

| Current                                                        | Suggested                                                                          | Why                                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `storedRichtext()` (**public**)                                | `stripRichtextReadValues()`                                                        | Removes computed values before saving; reads nothing |
| `safeRichtextUrl()` (**public**)                               | `isSafeRichtextUrl()`                                                              | Returns a boolean, not a cleaned URL                 |
| `walkAttributes()`                                             | `validateRichtextAttributes()`                                                     | It validates and throws                              |
| `richtextFields()`                                             | `findRichtextValues()`                                                             | Finds values with schema, location and condition     |
| `ClientRef` (scanner)                                          | `ResolvedClientReference`                                                          | A file and export, not the public specifier string   |
| `site`, `siteExport`, `siteImports`                            | `usedByAdminBar`, `adminBarExport`, `adminBarImports`                              | Code the bar reaches must not import styles          |
| `live()`, `load()` (nuxt composables)                          | `withPreviewDrafts()`, `useCmsAsyncData()`                                         | Merge drafts; read through `useAsyncData()`          |
| `caller()`                                                     | `resolveRequestCaller()`                                                           | Reads session and preview cookie                     |
| `session()`, `withSession()` middleware                        | `requireSession()`, `runIfSignedIn()`                                              | Differs from `cms.withSession()`                     |
| `userAccess()`, `ac`, `none`                                   | `buildUserManagementAccess()`, `accessControl`, `noPermissions`                    | better-auth user permissions, not content rules      |
| `lengthProblem()`, `passwordLength()`                          | `passwordLengthProblem()`, `enforcePasswordLengthPlugin()`                         | Return a message; build the plugin                   |
| `input()`, `assertFree()`, `asHttp()` (users)                  | `parseRequestBody()`, `requireAvailableInviteEmail()`, `toHttpError()`             | Validate; reject used emails; convert errors         |
| `HttpGroup`, `Http`, `Depth` (client types)                    | `HttpContainerField`, `HttpSchemaEntries`, `DefaultPopulateDepth`                  | `HttpGroup` also handles arrays and blocks           |
| `paths()`, `readQuery()`                                       | `selectionPaths()`, `serializeReadOptions()`                                       | Object to dotted paths; options to query string      |
| `flag()`, `treeOf()`, `readOptions()`, `coerce()` (http/query) | `parseBooleanQuery()`, `pathsToTree()`, `parseReadOptions()`, `parseFilterValue()` | `flag()` separates absent, valid and invalid         |
| `switchTarget()` (**public**)                                  | `localeSwitchUrl()`                                                                | Returns a translation URL or the locale's home       |
| `Image`, `urlOf()` (seo-meta)                                  | `unknown`, `mediaUrl()`                                                            | `Image` is only an alias for `unknown`               |
| `invite()`, `template()`, `escape()` (email)                   | `createInviteTemplate()`, `createActionEmailTemplate()`, `escapeHtml()`            | Name the output format                               |
| `textFor()`, `optionsOf()`                                     | `defaultTextForLocale()`, `normalizeStringOptions()`                               | Strings preset helpers                               |
| `Reference` (errors, **public**)                               | `ReferenceOwner`                                                                   | The document or global that blocks a delete          |

## Tests and fixtures

| Current                                              | Suggested                                                                              | Why                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| `setup()`, `fresh()`, `Env`                          | `createTestClient()`, `createTestEnvironment()`, `TestEnvironment`                     | Bind a client; create the default environment |
| `fetchWithSession`                                   | `fetchApi`                                                                             | Adds the API prefix; does not sign in         |
| `tmpDb()`, `tables()`, `status()`                    | `temporaryDatabaseUrl()`, `listTableNames()`, `rejectionStatusOrError()`               | Say what they return                          |
| `seed()` and its `m`, `a`, `p`, `t1`, `t2`           | `seedRelatedContent()`, `asset`, `author`, `post`, `firstTag`, `secondTag`             | Shared fixture names spread into many tests   |
| `seeded()`, `doc()`, `global()`, `at()`              | `createLocaleRowFixtures()`, `insertDocument()`, `insertGlobal()`, `publicationTime()` | Not pre-seeded; they insert rows directly     |
| `p`, `a`, `d0`, `d1`, `o`, `g`, `j` (inference test) | `post`, `author`, `unpopulatedPost`, `postAtDepthOne`, …                               | Name results after the option under test      |

## Repeated patterns

| Pattern                                                                                                                  | Better                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `s` means scope, schema or environment                                                                                   | `nestedScope`, `schema`, `operationContext`                                                                   |
| `inner` names both operation state and nested fields                                                                     | `operationContext`, `itemFields`, `nestedFields`                                                              |
| `f`, `r`, `d`, `p` outlive a small callback                                                                              | `field`, `reference`, `document`, `plugin`                                                                    |
| `base`, `own`, `source`, `target` mean unrelated things                                                                  | Name the role: `commonHookArgs`, `metadataLocalePrefix`, `targetFields`                                       |
| `before`, `after`, `next`, `current` hide the pipeline stage                                                             | `beforeReadResults`, `afterReadResults`, `nextItems`, `requestVersion`                                        |
| Predicate-looking names that throw or do work                                                                            | `is`/`can` for yes/no; `require`/`validate`/`enforce` for rejects                                             |
| Names without a unit or shape                                                                                            | `UPLOAD_TTL_MS`, `IMAGE_HEADER_BYTES`, `partCount()`, `rowKey()`                                              |
| Short names in the S3, admin-bar and upload helpers (`n`, `size`, `total`, `gate`, `busy`, `asked`, `served`, `mounted`) | `partNumber`, `sizeBytes`, `totalBytes`, `waitFor`, `isRefreshing`, `requestedMode`. Keep the wire field `n`. |

## How to apply

- Start with the internal operation types, hook collection, access helpers and misleading media actions. They improve the most call sites. Change imports, variables, tests and module READMEs together.
- **Public names need a separate compatibility decision:** `File`, `Image`, `Reference`, `edit`, `merge`, `switchTarget`, `storedRichtext`, `safeRichtextUrl`. The multipart field `n` is also part of an HTTP contract.
- Do not rename configured keys such as `afterRead`, `beforeChange` or `onDelete`. Renaming SQL aliases needs the row types, builders and decoder to change together. Persisted columns stay as they are.
- Keep ordinary names where context explains them: `id`, `db`, `url`, `cms`, `schema`, `fields`, `doc`, a loop `i`, sort `a`/`b`, a single `T`. Keep `populate`, `draft`, `locale` and `perspective`. The problem is missing meaning, not short spelling.
