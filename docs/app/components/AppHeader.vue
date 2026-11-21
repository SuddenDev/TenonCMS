<script setup lang="ts">
import DocusAppHeader from "docus/app/components/app/AppHeader.vue";

const darkSection = shallowRef<Element>();

/** Finds the full-width dark section that crosses the middle line of the header. */
function update() {
  const line = (document.querySelector("header")?.offsetHeight ?? 0) / 2;

  darkSection.value = [...document.querySelectorAll(".full-bleed")].find((section) => {
    const { top, bottom } = section.getBoundingClientRect();
    return top <= line && bottom > line;
  });
}

onMounted(() => {
  update();
  addEventListener("scroll", update, { passive: true });
});

onBeforeUnmount(() => removeEventListener("scroll", update));
</script>

<template>
  <DocusAppHeader
    :class="{ dark: darkSection, 'dark-deep': darkSection?.classList.contains('dark-deep') }"
  />
</template>
