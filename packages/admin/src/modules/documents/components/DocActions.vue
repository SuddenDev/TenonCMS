<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { localeLabel } from "@/shared/locale";
import Icon from "@/shared/components/Icon.vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { type localeStatus, localeDialog } from "@/modules/documents/locale-status";
import { structureDialog, type StructureMenu } from "@/modules/documents/sync-structure";
import type {
  StructureCounts,
  SyncChoice,
} from "../../../../../core/src/content/writes/sync-structure";

// The "…" menu of a document or global. Every language action asks first and then emits.
// `history`: offers the version history. `duplicate`: offers a copy of the document. `languages`: the states from `localeStatus()`; without them the language
// group is hidden. `locale`: the active language.
// `structure`: offers the Structure submenu. `dryRun` gives the counts of a switch to one structure before it asks.
const props = defineProps<{
  history?: boolean;
  duplicate?: boolean;
  languages?: ReturnType<typeof localeStatus>;
  locale?: string;
  defaultLocale?: string;
  busy?: boolean;
  structure?: StructureMenu;
  dryRun?: (sync: SyncChoice) => Promise<StructureCounts>;
}>();
const emit = defineEmits<{
  history: [];
  duplicate: [];
  copy: [from: string, to: string];
  remove: [locale: string];
  discardAll: [];
  structure: [sync: SyncChoice];
}>();

const i18n = useI18n();
const { t } = i18n;

type Pending =
  | { kind: "copy"; from: string; to: string }
  | { kind: "remove"; locale: string }
  | { kind: "discard" }
  | { kind: "structure"; sync: SyncChoice; counts: StructureCounts };

const states = computed(() => props.languages?.states ?? []);
const others = computed(() => states.value.filter((s) => s.locale !== props.locale));
const exists = (l: string) => states.value.find((s) => s.locale === l)?.state !== "missing";

const open = ref(false);
// Kept after closing, so the text stays while the dialog fades out.
const pending = shallowRef<Pending>();
const text = computed(() => {
  const p = pending.value;
  if (!p) return undefined;
  if (p.kind === "copy") return localeDialog({ ...p, exists: exists(p.to) }, i18n);
  if (p.kind === "remove") return localeDialog(p, i18n);
  if (p.kind === "structure")
    return { ...structureDialog(p.counts, props.locale!, i18n), destructive: false };
  const { shared, locales } = props.languages!.discardAll;
  return localeDialog({ kind: "discard", shared, locales }, i18n);
});

function ask(next: Pending) {
  pending.value = next;
  open.value = true;
}

function confirm() {
  const p = pending.value!;
  if (p.kind === "copy") emit("copy", p.from, p.to);
  else if (p.kind === "remove") emit("remove", p.locale);
  else if (p.kind === "structure") emit("structure", p.sync);
  else emit("discardAll");
}

const structureValue = computed(() =>
  props.structure?.followsDefault ? "default" : props.structure?.synced ? "same" : "separate",
);
// Turning one structure on changes what other languages show, so it asks with the counts first.
async function chooseStructure(sync: SyncChoice) {
  const next = sync === "default" ? props.structure!.defaultOn : sync;
  if (!next || props.structure!.synced || !props.dryRun) return emit("structure", sync);
  ask({ kind: "structure", sync, counts: await props.dryRun(sync) });
}
</script>

<template>
  <DropdownMenu v-if="history || duplicate || languages">
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" :aria-label="t('documents.actions')" :disabled="busy">
        <Icon name="ellipsis" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-48">
      <DropdownMenuGroup v-if="history || duplicate">
        <DropdownMenuLabel>{{ t("documents.document") }}</DropdownMenuLabel>
        <DropdownMenuItem v-if="history" @select="emit('history')">
          <Icon name="history" />{{ t("documents.history") }}
        </DropdownMenuItem>
        <DropdownMenuItem v-if="duplicate" @select="emit('duplicate')">
          <Icon name="copy" />{{ t("documents.duplicate") }}
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator v-if="(history || duplicate) && languages" />
      <DropdownMenuGroup v-if="languages">
        <DropdownMenuLabel>{{ t("locales.group") }}</DropdownMenuLabel>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{{ t("locales.copyFrom") }}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>{{ t("locales.from") }}</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="s in others"
              :key="s.locale"
              :disabled="s.state === 'missing'"
              @select="ask({ kind: 'copy', from: s.locale, to: locale! })"
            >
              {{ localeLabel(s.locale) }}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>{{ t("locales.copyTo") }}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuLabel>{{ t("locales.to") }}</DropdownMenuLabel>
            <DropdownMenuItem
              v-for="s in others"
              :key="s.locale"
              @select="ask({ kind: 'copy', from: locale!, to: s.locale })"
            >
              {{ localeLabel(s.locale) }}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub v-if="structure">
          <DropdownMenuSubTrigger>{{ t("structure.menu") }}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup :model-value="structureValue">
              <DropdownMenuRadioItem value="same" @select="chooseStructure(true)">
                {{ t("structure.same") }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="separate" @select="chooseStructure(false)">
                {{ t("structure.separate") }}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="default" @select="chooseStructure('default')">
                {{
                  t("structure.default", {
                    state: t(structure.defaultOn ? "structure.on" : "structure.off"),
                  })
                }}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <template v-if="locale !== defaultLocale && exists(locale!)">
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            @select="ask({ kind: 'remove', locale: locale! })"
          >
            {{ t("locales.removeTranslation") }}
          </DropdownMenuItem>
        </template>
        <template v-if="languages.discardAll.show">
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" @select="ask({ kind: 'discard' })">
            {{ t("locales.discardAll") }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
  <AlertDialog v-model:open="open">
    <AlertDialogContent v-if="text">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ text.title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ text.description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("common.cancel") }}</AlertDialogCancel>
        <AlertDialogAction :variant="text.destructive ? 'destructive' : 'default'" @click="confirm">
          {{ text.action }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
