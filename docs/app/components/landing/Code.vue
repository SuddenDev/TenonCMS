<script setup lang="ts">
interface CodeBlock {
  code: string;
  lang?: string;
  /** The file name, or the tab label when there are several blocks. */
  label?: string;
}

const props = defineProps<{ blocks: CodeBlock[] }>();

const fence = "```";
const markdown = computed(() => {
  const fenced = props.blocks.map(
    ({ code, lang = "ts", label }) =>
      `${fence}${lang}${label ? ` [${label}]` : ""}\n${code}\n${fence}`,
  );

  return fenced.length > 1 ? `::code-group\n${fenced.join("\n")}\n::` : fenced[0]!;
});
</script>

<template>
  <!-- Rendered as markdown to reuse the docs code block: highlighting, copy button, tabs. -->
  <MDC :value="markdown" class="*:my-0" />
</template>
