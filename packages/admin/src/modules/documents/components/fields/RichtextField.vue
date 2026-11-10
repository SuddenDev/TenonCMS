<script setup lang="ts">
// Imports
import { computed, inject, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from "vue";
import { Editor, EditorContent } from "@tiptap/vue-3";
import { getSchema, type Extensions } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { useI18n } from "vue-i18n";
import { schema, client } from "@/shared/api";
import { text } from "@/shared/i18n";
import { registryKey } from "@/shared/options";
import { Button } from "@/shared/components/ui/button";
import Icon from "@/shared/components/Icon.vue";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/shared/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import PaneExpandButton from "@/shared/components/pane/PaneExpandButton.vue";
import MediaField from "@/modules/media/components/MediaField.vue";
import FieldFrame from "./FieldFrame.vue";
import type { FieldProps } from "./types";
import LinkDialog from "./richtext/LinkDialog.vue";
import { decorateReferences } from "./richtext/decorate";
import { useLocale } from "@/shared/composables/useLocale";
import { controls } from "./richtext/controls";
import { loadClientRef } from "../../../../../../core/src/admin/browser/lazy-mount";
import {
  classPlaces,
  RICHTEXT_DEFAULTS,
  richtextExtensions,
} from "../../../../../../core/src/richtext/runtime/extensions";
import {
  storedRichtext,
  richtextReferences,
} from "../../../../../../core/src/richtext/runtime/walk";
import {
  checkRichtextContent,
  pruneRichtext,
} from "../../../../../../core/src/richtext/runtime/validation";
import type {
  RichtextBrowserExtension,
  RichtextControl,
  RichtextDocument,
} from "../../../../../../core/src/richtext/config/types";

// Field context
const props = defineProps<FieldProps<"richtext">>();
const model = defineModel<RichtextDocument | null>();
const { t } = useI18n();
const { locale } = useLocale();
const registry = inject(registryKey, {});

// Editor lifecycle
const editor = shallowRef<Editor>();
const failure = ref("");
const busy = ref(true);
const operationError = ref("");
let disposed = false;
const empty: RichtextDocument = { type: "doc", content: [{ type: "paragraph" }] };
let extensions: Extensions = [];
let editorSchema: Schema;
// Marks and attributes the field does not offer are hidden, and removed on the next edit.
const hidden = ref<string[]>([]);

onMounted(async () => {
  try {
    const extra: Record<string, Extensions> = {};

    for (const [feature, registration] of Object.entries(
      schema.value.admin?.richtext?.extensions ?? {},
    )) {
      if (!on(feature)) continue;

      const browser = await loadClientRef<RichtextBrowserExtension>(registration.client, registry);
      if (!browser || !Array.isArray(browser.extensions))
        throw new Error(`Invalid rich text extension: ${feature}`);

      extra[feature] = browser.extensions;
      for (const control of browser.controls ?? []) pluginControls.value.push({ feature, control });
    }
    if (disposed) return;

    extensions = richtextExtensions(props.field.allowed, extra, {
      ...classPlaces(props.field.classes),
      attribute: "data-class",
    });
    editorSchema = getSchema(extensions);
    const { value: document, dropped } = pruneRichtext(model.value ?? empty, editorSchema);
    checkRichtextContent(document, editorSchema);
    hidden.value = dropped;

    const initial = richtextReferences(document).length
      ? await client.links.resolve(document, { locale: locale.value })
      : document;
    if (disposed) return;

    referenceSignature = signature(initial);
    editor.value = new Editor({
      extensions,
      content: initial,
      editable: !props.field.readOnly,
      enableContentCheck: true,
      editorProps: {
        attributes: {
          class: "cms-richtext-content",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": text(props.field.label) ?? props.name,
          "aria-required": String(!!props.field.required && !props.loose),
        },
        handleDOMEvents: {
          blur: () => {
            emitBlur();
            return false;
          },
        },
      },
      onUpdate: ({ editor: e }) => {
        hidden.value = [];
        model.value = storedRichtext(e.getJSON() as RichtextDocument) as RichtextDocument;
        refreshReferences();
      },
      onContentError: ({ error }) => {
        failure.value = error.message;
        editor.value?.setEditable(false);
      },
    });
  } catch (e) {
    failure.value = (e as Error).message;
  } finally {
    if (!disposed) busy.value = false;
  }
});

function emitBlur() {
  editor.value?.view.dom.dispatchEvent(new Event("change", { bubbles: true }));
}
watch(
  () => props.field.readOnly,
  (value) => editor.value?.setEditable(!value && !failure.value),
);
watch(
  model,
  (value) => {
    const e = editor.value;
    if (!e) return;

    const next = pruneRichtext(value ?? empty, editorSchema);
    if (
      JSON.stringify(storedRichtext(e.getJSON() as RichtextDocument)) === JSON.stringify(next.value)
    )
      return;

    try {
      checkRichtextContent(next.value, editorSchema);
      e.commands.setContent(next.value, { emitUpdate: false, errorOnInvalidContent: true });
      hidden.value = next.dropped;

      referenceSignature = "";
      refreshReferences();
    } catch (error) {
      failure.value = (error as Error).message;
      e.setEditable(false);
    }
  },
  { deep: true },
);
onBeforeUnmount(() => {
  disposed = true;
  editor.value?.destroy();
});

// Reference resolution
let referenceRequest = 0;
let referenceSignature = "";
const broken = computed(() => {
  return editor.value
    ? richtextReferences(editor.value.getJSON() as RichtextDocument).filter(
        (r) => r.reference.deleted || r.node.attrs?.broken,
      ).length
    : 0;
});

function signature(document: RichtextDocument) {
  return JSON.stringify(richtextReferences(document).map((r) => r.reference));
}
async function refreshReferences() {
  const e = editor.value;
  if (!e) return;

  const document = storedRichtext(e.getJSON() as RichtextDocument) as RichtextDocument;
  const next = signature(document);
  if (next === referenceSignature) return;

  referenceSignature = next;
  const request = ++referenceRequest;

  try {
    const resolved = await client.links.resolve(document, { locale: locale.value });
    if (!disposed && request === referenceRequest && editor.value)
      decorateReferences(editor.value, resolved);
  } catch (error) {
    if (!disposed && request === referenceRequest) {
      referenceSignature = "";
      operationError.value = (error as Error).message;
    }
  }
}

// Toolbar controls
const pluginControls = ref<{ feature: string; control: RichtextControl }[]>([]);
// The same default as the server: the short built-in list and every registered extension.
const features = computed<readonly string[]>(
  () =>
    props.field.allowed ?? [
      ...RICHTEXT_DEFAULTS,
      ...Object.keys(schema.value.admin?.richtext?.extensions ?? {}),
    ],
);
const on = (name: string) => features.value.includes(name);
const toolbar = computed(() => {
  return controls.filter((c) => on(c.feature));
});

function block(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  const e = editor.value;
  if (!e) return;

  if (value === "paragraph") e.chain().focus().setParagraph().run();
  else
    e.chain()
      .focus()
      .setHeading({ level: Number(value) as 1 | 2 | 3 | 4 | 5 | 6 })
      .run();
}
const blockValue = computed(() => {
  return editor.value?.isActive("heading")
    ? String(editor.value.getAttributes("heading").level)
    : "paragraph";
});

// Classes
const blockClasses = computed(() => props.field.classes?.filter((c) => c.on === "block") ?? []);
const textClasses = computed(() => props.field.classes?.filter((c) => c.on === "text") ?? []);
const blockType = () => (editor.value?.isActive("heading") ? "heading" : "paragraph");
const blockClass = computed(() => editor.value?.getAttributes(blockType()).class ?? null);
const textClass = computed(() => editor.value?.getAttributes("textClass").class ?? null);

function toggleBlockClass(name: string) {
  const value = blockClass.value === name ? null : name;
  editor.value?.chain().focus().updateAttributes(blockType(), { class: value }).run();
}
function toggleTextClass(name: string) {
  const chain = editor.value?.chain().focus();
  if (textClass.value === name) chain?.unsetMark("textClass").run();
  else chain?.setMark("textClass", { class: name }).run();
}

// The admin does not load the site's CSS, so a class shows its `preview` styles, scoped to this editor.
const scope = useId();
const previewCss = computed(() =>
  (props.field.classes ?? [])
    .filter((c) => c.preview)
    .map((c) => {
      const element = c.on === "text" ? "span" : ":is(p, h1, h2, h3, h4, h5, h6)";
      return `[data-richtext="${scope}"] ${element}[data-class="${CSS.escape(c.name)}"] { ${cssText(c.preview!)} }`;
    })
    .join("\n"),
);

function cssText(style: Record<string, string | number>) {
  return Object.entries(style)
    .filter(([, value]) => !/[{}<;]/.test(String(value)))
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}: ${value};`)
    .join(" ");
}

// Selection
let selection = { from: 1, to: 1 };

function remember() {
  if (editor.value)
    selection = { from: editor.value.state.selection.from, to: editor.value.state.selection.to };
}

// Links
const linkOpen = ref(false);
const linkAttrs = ref<Record<string, any>>({});

function showLink() {
  remember();
  linkAttrs.value = editor.value?.getAttributes("link") ?? {};
  linkOpen.value = true;
}
function applyLink(attrs: Record<string, any>, label: string) {
  const e = editor.value;
  if (!e || props.field.readOnly) return;

  const chain = e.chain().focus().setTextSelection(selection);
  if (selection.from === selection.to && !e.isActive("link"))
    chain.insertContent({ type: "text", text: label, marks: [{ type: "link", attrs }] }).run();
  else
    chain
      .extendMarkRange("link")
      .setLink(attrs as any)
      .run();
}

// Images
const imageOpen = ref(false);
const imageId = ref<string | null>(null);

async function insertImage() {
  if (!imageId.value || !editor.value || props.field.readOnly) return;

  operationError.value = "";

  try {
    const media = await client.findById("media", imageId.value);
    if (disposed || !editor.value) return;

    editor.value
      .chain()
      .focus()
      .setTextSelection(selection)
      .setImage({
        src: media.src ?? media.url,
        alt: media.alt ?? "",
        reference: { collection: "media", id: imageId.value },
      } as any)
      .run();
    imageOpen.value = false;
  } catch (e) {
    operationError.value = (e as Error).message;
  }
}

// Tables
const tableActions = [
  "addColumnBefore",
  "addColumnAfter",
  "deleteColumn",
  "addRowBefore",
  "addRowAfter",
  "deleteRow",
  "toggleHeaderRow",
  "mergeCells",
  "splitCell",
  "deleteTable",
] as const;
function table(action: (typeof tableActions)[number]) {
  editor.value?.chain().focus()[action]().run();
}
</script>
<template>
  <FieldFrame v-bind="props" v-slot="{ id, invalid, required }">
    <component :is="'style'" v-if="previewCss">{{ previewCss }}</component>
    <div
      :data-richtext="scope"
      class="border-input overflow-hidden rounded-lg border"
      :aria-invalid="invalid"
      :aria-busy="busy"
    >
      <!-- loading -->
      <p v-if="busy" class="text-muted-foreground p-4 text-sm" role="status">
        {{ t("common.loading") }}
      </p>

      <!-- editor -->
      <template v-else-if="editor && !failure">
        <div
          role="toolbar"
          :aria-label="t('richtext.toolbar')"
          class="bg-muted/30 border-border flex flex-wrap items-center gap-0.5 border-b p-1.5"
        >
          <fieldset :disabled="field.readOnly" class="contents">
            <select
              v-if="on('heading')"
              :value="blockValue"
              class="bg-background h-7 max-w-28 rounded px-1 text-xs"
              :aria-label="t('richtext.block')"
              @change="block"
            >
              <option value="paragraph">{{ t("richtext.paragraph") }}</option>
              <option v-for="level in 6" :key="level" :value="level">
                {{ t("richtext.heading") }} {{ level }}
              </option>
            </select>
            <DropdownMenu v-if="field.classes?.length">
              <DropdownMenuTrigger as-child>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="t('richtext.classes')"
                  :title="t('richtext.classes')"
                  :aria-pressed="!!(blockClass || textClass)"
                  :class="(blockClass || textClass) && 'bg-accent'"
                  ><Icon name="palette"
                /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" class="min-w-48">
                <template v-if="blockClasses.length">
                  <DropdownMenuLabel>{{ t("richtext.blockClass") }}</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    v-for="c in blockClasses"
                    :key="c.name"
                    :model-value="blockClass === c.name"
                    @select="toggleBlockClass(c.name)"
                  >
                    <span :style="c.preview">{{ text(c.label) ?? c.name }}</span>
                  </DropdownMenuCheckboxItem>
                </template>
                <DropdownMenuSeparator v-if="blockClasses.length && textClasses.length" />
                <template v-if="textClasses.length">
                  <DropdownMenuLabel>{{ t("richtext.textClass") }}</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    v-for="c in textClasses"
                    :key="c.name"
                    :model-value="textClass === c.name"
                    @select="toggleTextClass(c.name)"
                  >
                    <span :style="c.preview">{{ text(c.label) ?? c.name }}</span>
                  </DropdownMenuCheckboxItem>
                </template>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              v-for="control in toolbar"
              :key="control.feature"
              type="button"
              variant="ghost"
              size="icon-sm"
              :title="t(`richtext.${control.feature}`)"
              :aria-label="t(`richtext.${control.feature}`)"
              :aria-pressed="control.active?.(editor)"
              :class="control.active?.(editor) && 'bg-accent'"
              @click="control.run(editor)"
              ><Icon :name="control.icon"
            /></Button>
            <template v-if="on('textAlign')"
              ><Button
                v-for="align in ['left', 'center', 'right', 'justify']"
                :key="align"
                type="button"
                variant="ghost"
                size="icon-sm"
                :aria-label="t(`richtext.${align}`)"
                :title="t(`richtext.${align}`)"
                :aria-pressed="editor.isActive({ textAlign: align })"
                @click="editor.chain().focus().setTextAlign(align).run()"
                ><Icon :name="`align-${align}`" /></Button
            ></template>
            <label
              v-if="on('color')"
              class="hover:bg-accent flex size-7 cursor-pointer items-center justify-center rounded"
              :title="t('richtext.color')"
              ><input
                type="color"
                class="size-5 cursor-pointer border-0 p-0"
                :aria-label="t('richtext.color')"
                @input="
                  editor
                    .chain()
                    .focus()
                    .setColor(($event.target as HTMLInputElement).value)
                    .run()
                "
            /></label>
            <Button
              v-if="on('link')"
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="t('richtext.link')"
              :title="t('richtext.link')"
              :aria-pressed="editor.isActive('link')"
              @click="showLink"
              ><Icon name="link"
            /></Button>
            <Button
              v-if="on('image') && schema.media"
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="t('richtext.image')"
              :title="t('richtext.image')"
              @click="
                remember();
                imageId = null;
                imageOpen = true;
              "
              ><Icon name="image"
            /></Button>
            <DropdownMenu v-if="on('table')"
              ><DropdownMenuTrigger as-child
                ><Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  :aria-label="t('richtext.table')"
                  :title="t('richtext.table')"
                  ><Icon name="table" /></Button></DropdownMenuTrigger
              ><DropdownMenuContent
                ><DropdownMenuItem
                  @select="
                    editor
                      .chain()
                      .focus()
                      .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                      .run()
                  "
                  >{{ t("richtext.insertTable") }}</DropdownMenuItem
                ><DropdownMenuItem
                  v-for="action in tableActions"
                  :key="action"
                  :disabled="!editor.isActive('table')"
                  @select="table(action)"
                  >{{ t(`richtext.${action}`) }}</DropdownMenuItem
                ></DropdownMenuContent
              ></DropdownMenu
            >
            <Button
              v-for="({ feature, control }, index) in pluginControls"
              :key="`${feature}-${index}`"
              type="button"
              variant="ghost"
              size="sm"
              :disabled="control.disabled?.(editor)"
              :aria-pressed="control.active?.(editor)"
              @click="control.run(editor)"
              >{{ text(control.label) }}</Button
            >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :aria-label="t('richtext.clear')"
              :title="t('richtext.clear')"
              @click="editor.chain().focus().unsetAllMarks().clearNodes().run()"
              ><Icon name="remove-formatting"
            /></Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :disabled="!editor.can().undo()"
              :aria-label="t('richtext.undo')"
              :title="t('richtext.undo')"
              @click="editor.chain().focus().undo().run()"
              ><Icon name="undo-2"
            /></Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :disabled="!editor.can().redo()"
              :aria-label="t('richtext.redo')"
              :title="t('richtext.redo')"
              @click="editor.chain().focus().redo().run()"
              ><Icon name="redo-2"
            /></Button>
          </fieldset>
          <div class="ml-auto"><PaneExpandButton /></div>
        </div>
        <p v-if="operationError" class="text-destructive px-4 pt-3 text-xs" role="alert">
          {{ operationError }}
        </p>
        <p v-if="hidden.length" class="text-muted-foreground px-4 pt-3 text-xs" role="status">
          {{ t("richtext.hidden", { names: hidden.join(", ") }) }}
        </p>
        <p v-if="broken" class="text-destructive px-4 pt-3 text-xs" role="status">
          {{ t("richtext.brokenLinks", { count: broken }) }}
        </p>
        <EditorContent
          :id="id"
          :editor="editor"
          :aria-invalid="invalid"
          :aria-required="required"
          :aria-label="text(field.label) ?? name"
        />
      </template>

      <!-- if could not be loaded -->
      <div v-if="failure" class="p-4">
        <p class="text-destructive text-sm" role="alert">
          {{ t("richtext.unsupported") }} {{ failure }}
        </p>
        <pre class="mt-3 max-h-48 overflow-auto text-xs">{{ JSON.stringify(model, null, 2) }}</pre>
      </div>
    </div>

    <!-- Custom Link Dialog -->
    <LinkDialog
      v-model:open="linkOpen"
      :attrs="linkAttrs"
      @apply="applyLink"
      @remove="
        editor
          ?.chain()
          .focus()
          .setTextSelection(selection)
          .extendMarkRange('link')
          .unsetLink()
          .run()
      "
    />

    <!-- Custom Media Dialog -->
    <Dialog v-model:open="imageOpen"
      ><DialogContent
        ><DialogHeader
          ><DialogTitle>{{ t("richtext.image") }}</DialogTitle></DialogHeader
        ><MediaField v-model="imageId" :field="{ type: 'image' }" />
        <p v-if="operationError" role="alert" class="text-destructive text-sm">
          {{ operationError }}
        </p>
        <DialogFooter
          ><Button type="button" :disabled="!imageId" @click="insertImage">{{
            t("media.select")
          }}</Button></DialogFooter
        ></DialogContent
      ></Dialog
    >
  </FieldFrame>
</template>
