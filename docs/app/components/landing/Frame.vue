<template>
  <!-- A dark window inside a translucent bezel. Holds the terminal and the product video. -->
  <div
    class="rounded-lg bg-white/20 p-1 ring-1 ring-neutral-400/30 backdrop-blur-sm lg:rounded-2xl lg:p-1.5 dark:bg-black/20"
  >
    <div
      class="dark text-default overflow-hidden rounded-md bg-neutral-950 shadow-2xl lg:rounded-xl"
    >
      <slot />
    </div>
  </div>
</template>
