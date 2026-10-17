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
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { type localeStatus, localeDialog } from "@/modules/documents/locale-status";

// The "…" menu of a localized document or global. Every action asks first and then emits.
// `languages`: the states from `localeStatus()`. `locale`: the active language.
const props = defineProps<{
  languages: ReturnType<typeof localeStatus>;
  locale: string;
  defaultLocale: string;
  busy?: boolean;
}>();
const emit = defineEmits<{
  copy: [from: string, to: string];
  remove: [locale: string];
  discardAll: [];
}>();

const i18n = useI18n();
const { t } = i18n;

type Pending =
  | { kind: "copy"; from: string; to: string }
  | { kind: "remove"; locale: string }
  | { kind: "discard" };

const others = computed(() => props.languages.states.filter((s) => s.locale !== props.locale));
const exists = (l: string) =>
  props.languages.states.find((s) => s.locale === l)?.state !== "missing";

const open = ref(false);
// Kept after closing, so the text stays while the dialog fades out.
const pending = shallowRef<Pending>();
const text = computed(() => {
  const p = pending.value;
  if (!p) return undefined;
  if (p.kind === "copy") return localeDialog({ ...p, exists: exists(p.to) }, i18n);
  if (p.kind === "remove") return localeDialog(p, i18n);
  const { shared, locales } = props.languages.discardAll;
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
  else emit("discardAll");
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon-sm" :aria-label="t('locales.actions')" :disabled="busy">
        <Icon name="ellipsis" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-48">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>{{ t("locales.copyFrom") }}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            v-for="s in others"
            :key="s.locale"
            :disabled="s.state === 'missing'"
            @select="ask({ kind: 'copy', from: s.locale, to: locale })"
          >
            {{ localeLabel(s.locale) }}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>{{ t("locales.copyTo") }}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            v-for="s in others"
            :key="s.locale"
            @select="ask({ kind: 'copy', from: locale, to: s.locale })"
          >
            {{ localeLabel(s.locale) }}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <template v-if="locale !== defaultLocale && exists(locale)">
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" @select="ask({ kind: 'remove', locale })">
          {{ t("locales.removeTranslation") }}
        </DropdownMenuItem>
      </template>
      <template v-if="languages.discardAll.show">
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" @select="ask({ kind: 'discard' })">
          {{ t("locales.discardAll") }}
        </DropdownMenuItem>
      </template>
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
