<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Which options to list. */
    section?: "common" | "admin";
    /** `false` lists the options without the toggle, like on the fields overview. */
    collapsible?: boolean;
  }>(),
  { collapsible: true },
);

type Option = { name: string; type: string; description: string; adminOnly?: true };

const fields = "/docs/core/content-modeling/fields";

// The one list of options that every field type takes. Descriptions are Markdown.
const options: Option[] = [
  {
    name: "label",
    type: "string | { en, de, … }",
    description: "The label in the admin. Defaults to the key. Pass an object to translate it.",
  },
  {
    name: "description",
    type: "string | { en, de, … }",
    description: "Help text below the input.",
  },
  {
    name: "required",
    type: "boolean",
    description: "The value MUST be present. A list needs at least one item.",
  },
  {
    name: "default",
    type: "value | ({ user, … }) => value",
    description:
      "The value of a new document, when the field is missing. A plain value also fills the new form in the admin. A function, like `({ user }) => user?.id`, runs on the server only.",
  },
  {
    name: "unique",
    type: "boolean",
    description: `No other document of the collection has the same value. See [Validation](${fields}#validation).`,
  },
  {
    name: "validate",
    type: "(value, args) => true | string",
    description: `Your own check. See [Your own checks](${fields}#your-own-checks).`,
  },
  {
    name: "condition",
    type: "Condition",
    description: `Show the field only when other values match. See [Conditions](${fields}#conditions).`,
  },
  {
    name: "private",
    type: "boolean",
    description: "Public reads leave the value out. Signed-in users and server code see it.",
  },
  {
    name: "access",
    type: "{ read, create, update }",
    description:
      "Who can read and write this field. See [Access control](/docs/core/users-and-access/access-control).",
  },
  {
    name: "localized",
    type: "false",
    description:
      "In a localized collection, every field is stored per language. `false` shares this field between languages. Only on top-level fields. See [Localization](/docs/core/working-with-content/localization).",
  },
  {
    name: "hooks",
    type: "FieldHooks",
    description:
      "Functions that run for this field on every write and read, before the collection's hooks. See [Hooks](/docs/core/working-with-content/hooks).",
  },
  {
    name: "hidden",
    type: "boolean",
    adminOnly: true,
    description:
      "The admin does not show the input. The value still saves. Use it for values a hook sets.",
  },
  {
    name: "readOnly",
    type: "boolean",
    adminOnly: true,
    description: "The admin shows the input disabled. Code and hooks can still write it.",
  },
  {
    name: "width",
    type: '"1/4" | "1/3" | "1/2" | "2/3" | "3/4" | "full"',
    adminOnly: true,
    description:
      'The share of the row the field takes. Fields next to each other fill a row. In a narrow form, every field takes the full width. Default `"full"`.',
  },
  {
    name: "separator",
    type: "true | string",
    adminOnly: true,
    description:
      "A line above the field, to break up a long form. A string adds a heading above the line.",
  },
  {
    name: "tab",
    type: "string | string[]",
    adminOnly: true,
    description:
      "The tab that shows this field. Define the tabs with `tabs` on the collection, global, group or list item.",
  },
  {
    name: "fieldset",
    type: "string",
    adminOnly: true,
    description: "The box that holds this field. Define the boxes with `fieldsets`.",
  },
];

const shown = computed(() =>
  options.filter((o) => !props.section || !!o.adminOnly === (props.section === "admin")),
);

const adminOnly = [{ label: "Admin only", color: "note" as const }];
</script>

<template>
  <!-- The content stays in the DOM, because MDC renders only on the server here. -->
  <UCollapsible v-if="collapsible" :unmount-on-hide="false" class="border-default mt-2 border-t">
    <template #default="{ open }">
      <button
        type="button"
        class="group text-muted hover:text-highlighted flex w-full items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors"
      >
        <UIcon
          name="i-lucide-chevron-down"
          class="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
        {{ open ? "Hide common options" : "Show common options" }}
      </button>
    </template>

    <template #content>
      <p class="text-muted border-default mt-6 mb-8 border-b pb-4 text-sm">
        Every field type takes these options. See the
        <NuxtLink :to="fields" class="text-primary hover:underline">fields overview</NuxtLink>
        for examples and validation.
      </p>
      <ProseFieldGroup>
        <ProseField
          v-for="o in shown"
          :key="o.name"
          :name="o.name"
          :type="o.type"
          :badges="o.adminOnly ? adminOnly : undefined"
        >
          <MDC :value="o.description" unwrap="p" />
        </ProseField>
      </ProseFieldGroup>
    </template>
  </UCollapsible>

  <ProseFieldGroup v-else>
    <ProseField
      v-for="o in shown"
      :key="o.name"
      :name="o.name"
      :type="o.type"
      :badges="o.adminOnly ? adminOnly : undefined"
    >
      <MDC :value="o.description" unwrap="p" />
    </ProseField>
  </ProseFieldGroup>
</template>
