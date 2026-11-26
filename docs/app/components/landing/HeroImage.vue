<template>
  <LandingFrame>
    <div class="aspect-[3024/1964]">
      <NuxtPicture
        src="/images/tenon-screenshot-light.png"
        format="webp"
        sizes="100vw lg:1152px"
        alt="A screenshot of the Tenon admin (light mode)"
        class="block size-full [html.dark_&]:hidden"
        :img-attrs="{ class: 'size-full' }"
      />
      <NuxtPicture
        src="/images/tenon-screenshot-dark.png"
        format="webp"
        sizes="100vw lg:1152px"
        alt="A screenshot of the Tenon admin (dark mode)"
        class="hidden size-full [html.dark_&]:block"
        :img-attrs="{ class: 'size-full' }"
      />
    </div>
  </LandingFrame>
</template>
