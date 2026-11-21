<template>
  <!-- A dark window inside a translucent bezel. Holds the terminal and the product video. -->
  <div
    class="rounded-2xl bg-white/20 p-1.5 ring-1 ring-neutral-400/30 backdrop-blur-sm dark:bg-black/20"
  >
    <div class="dark text-default overflow-hidden rounded-xl bg-neutral-950 shadow-2xl">
      <slot />
    </div>
  </div>
</template>
