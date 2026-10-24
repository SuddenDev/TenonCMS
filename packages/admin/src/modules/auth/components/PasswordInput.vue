<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import Icon from "@/shared/components/Icon.vue";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/components/ui/input-group";
import { passwordChecks, passwordStrength } from "../password";

defineOptions({ inheritAttrs: false });
const { variant = "default" } = defineProps<{
  /** `register` shows which criteria a new password meets. */
  variant?: "default" | "register";
}>();
const model = defineModel<string>({ default: "" });

const { t } = useI18n();
const visible = ref(false);
const hints = useId();
const checks = computed(() => passwordChecks(model.value));
const strength = computed(() => passwordStrength(checks.value));
const level = computed(() =>
  strength.value <= 2 ? "weak" : strength.value === 3 ? "fair" : "strong",
);
</script>

<template>
  <InputGroup>
    <InputGroupInput
      v-model="model"
      v-bind="$attrs"
      :type="visible ? 'text' : 'password'"
      :aria-describedby="variant === 'register' && model ? hints : undefined"
    />
    <InputGroupAddon align="inline-end" class="border-l-0 bg-transparent">
      <InputGroupButton
        size="icon-xs"
        :aria-label="t(visible ? 'auth.hidePassword' : 'auth.showPassword')"
        :aria-pressed="visible"
        @click="visible = !visible"
      >
        <Icon :key="visible + '-input'" :name="visible ? 'eye-off' : 'eye'" />
      </InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
  <Transition
    enter-from-class="opacity-0 -translate-y-1"
    leave-to-class="opacity-0 -translate-y-1"
    enter-active-class="motion-safe:transition duration-150"
    leave-active-class="motion-safe:transition duration-100"
  >
    <div
      v-if="variant === 'register' && model"
      :id="hints"
      :data-level="level"
      class="group grid gap-1.5 text-xs"
    >
      <div class="flex items-center justify-between gap-2">
        <p
          aria-live="polite"
          class="group-data-[level=weak]:text-destructive group-data-[level=fair]:text-amber-600 group-data-[level=strong]:text-emerald-600 dark:group-data-[level=fair]:text-amber-300 dark:group-data-[level=strong]:text-emerald-300"
        >
          {{ t(`auth.strength.${level}`) }}
        </p>
        <div aria-hidden="true" class="flex gap-1">
          <span
            v-for="i in 5"
            :key="i"
            :data-on="i <= strength"
            class="bg-muted group-data-[level=weak]:data-[on=true]:bg-destructive h-1 w-5 rounded-full group-data-[level=fair]:data-[on=true]:bg-amber-500 group-data-[level=strong]:data-[on=true]:bg-emerald-500"
          />
        </div>
      </div>
      <ul class="grid gap-1">
        <li
          v-for="(met, key) in checks"
          :key="key"
          :data-met="met"
          class="text-muted-foreground flex items-center gap-1.5 data-[met=true]:text-emerald-600 dark:data-[met=true]:text-emerald-300"
        >
          <Icon :key="key + met" :name="met ? 'circle-check' : 'circle'" />
          {{ t(`auth.criteria.${key}`) }}
        </li>
      </ul>
    </div>
  </Transition>
</template>
