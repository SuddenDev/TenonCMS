<script setup lang="ts">
interface Line {
  mark: "◇" | "✓" | "→";
  text: string;
  value?: string;
}

const sessions: { label: string; value: string; command: string; lines: Line[] }[] = [
  {
    label: "create",
    value: "create",
    command: "npm create tenoncms@latest",
    lines: [
      { mark: "◇", text: "Where should we put your new project?", value: "./my-site" },
      { mark: "◇", text: "Which framework would you like to work with?", value: "Astro" },
      { mark: "◇", text: "Where will it run?", value: "Node" },
      { mark: "◇", text: "Which database should we use?", value: "SQLite / Turso" },
      { mark: "◇", text: "Where should media files go?", value: "Local disk" },
      { mark: "✓", text: "Created my-site" },
      { mark: "→", text: "Next steps", value: "cd my-site && npm run dev" },
    ],
  },
  {
    label: "dev",
    value: "dev",
    command: "npm run dev",
    lines: [
      { mark: "✓", text: "Local", value: "http://localhost:4321" },
      { mark: "→", text: "Open /admin to create the first admin user." },
    ],
  },
  {
    label: "backup",
    value: "backup",
    command: "npx tenon backup",
    lines: [
      { mark: "✓", text: "Full backup of my-site" },
      { mark: "◇", text: "The archive will hold", value: "content, media, users, jobs" },
      { mark: "◇", text: "File name", value: "tenon-my-site-2026-11-12-1530.zip" },
      { mark: "✓", text: "Wrote tenon-my-site-2026-11-12-1530.zip" },
    ],
  },
  {
    label: "upgrade",
    value: "upgrade",
    command: "npx tenon upgrade",
    lines: [
      { mark: "◇", text: "tenoncms", value: "0.26.0 → 0.27.0" },
      { mark: "◇", text: "Release notes:", value: "github.com/SuddenDev/TenonCMS/releases" },
      { mark: "✓", text: "Upgraded tenoncms to 0.27.0" },
    ],
  },
];

const active = ref(sessions[0]!.value);
const session = computed(() => sessions.find(({ value }) => value === active.value)!);
</script>

<template>
  <LandingFrame>
    <div class="flex min-h-80 flex-col font-mono text-sm">
      <div class="flex-1 space-y-1.5 overflow-x-auto p-5 whitespace-pre sm:p-7" aria-live="polite">
        <p class="mb-4 flex gap-x-2">
          <span class="text-dimmed">$</span>
          <span>{{ session.command }}</span>
        </p>
        <p v-for="line in session.lines" :key="line.text" class="flex gap-x-2">
          <span :class="line.mark === '✓' ? 'text-success' : 'text-dimmed'">{{ line.mark }}</span>
          <span class="text-muted">{{ line.text }}</span>
          <span v-if="line.value" class="text-primary">{{ line.value }}</span>
        </p>
      </div>

      <UTabs
        v-model="active"
        :items="sessions"
        :content="false"
        color="neutral"
        size="sm"
        class="mx-auto mb-4 w-auto"
        :ui="{ list: 'rounded-lg border border-default' }"
      />
    </div>
  </LandingFrame>
</template>
