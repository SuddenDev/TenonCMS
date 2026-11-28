<script setup lang="ts">
const src = "/tenon-demo-2.mp4";
const video = useTemplateRef("video");

onMounted(() => {
  if (!video.value || !matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  video.value.pause();
  video.value.controls = true;
});
</script>

<template>
  <LandingFrame>
    <div class="relative grid aspect-video place-items-center">
      <video
        ref="video"
        :src="src"
        aria-label="A short tour of the Tenon admin"
        autoplay
        muted
        loop
        playsinline
      />
    </div>
  </LandingFrame>
</template>
