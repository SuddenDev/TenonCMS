<script setup lang="ts">
import type { PageContext } from "integral-cms/admin";
import { createClient } from "integral-cms/client";
import { computed, ref, watchEffect } from "vue";
import { stars } from "../utils/stars.ts";
import { texts } from "../utils/texts.ts";
import type { Quote } from "../../types.ts";

const props = defineProps<PageContext>();
const t = computed(() => texts(props.integral.locale));

const client = createClient();
const quote = ref<Quote>();
watchEffect(async () => {
  quote.value = await client.findById("quotes", String(props.params.id));
});
</script>

<template>
  <div class="quote-wrapper">
    <p class="links">
      <a class="btn" :href="`${integral.base}/quote-stats`">{{ t("back") }}</a>
      <a v-if="quote" class="btn" :href="`${integral.base}/content/collections/quotes/${quote.id}`">
        {{ t("edit") }}
      </a>
    </p>
    <template v-if="quote">
      <hr />
      <blockquote>“{{ quote.text }}”</blockquote>
      <p class="meta">{{ quote.author }}</p>
      <p class="stars">{{ stars(quote.rating) }}</p>
    </template>
  </div>
</template>

<style scoped>
.quote-wrapper {
  max-width: 800px;
  margin: 20px auto;
}
.links {
  display: flex;
  gap: 0.5rem;
  justify-content: space-between;
}
hr {
  margin: 1rem 0;
  border: none;
  border-top: 1px solid rgb(128 128 128 / 0.15);
}
blockquote {
  font-size: 1.5rem;
}
.meta {
  margin-top: 0.5rem;
  opacity: 0.7;
}
.stars {
  margin-top: 0.5rem;
  color: #f59e0b;
  letter-spacing: 0.1em;
}
</style>
