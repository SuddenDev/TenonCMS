<script setup lang="ts">
import { computed, ref } from "vue";
import type { PageContext } from "integral-cms/admin";
import { API_BASE } from "integral-cms/client";
import { stars } from "../utils/stars.ts";
import { texts } from "../utils/texts.ts";
import type { Stats } from "../../types.ts";

const props = defineProps<PageContext<Stats>>();
const t = computed(() => texts(props.integral.locale));

const max = computed(() => Math.max(1, ...props.data.ratings));

// The rating whose bar was clicked; clicking it again clears the filter.
const rating = ref<number>();
const shown = computed(() =>
  rating.value
    ? props.data.quotes.filter((q) => q.rating === String(rating.value))
    : props.data.quotes,
);
const toggle = (n: number) => (rating.value = rating.value === n ? undefined : n);

const getRandomQuote = async () => {
  const response = await fetch(`${API_BASE}/example/random`, { method: "GET" });
  alert(
    response.ok
      ? `${t.value("randomResult")}\n\n ${await response.text()}`
      : t.value("randomFailed"),
  );
};
</script>

<template>
  <div class="stats-wrapper">
    <p class="links">
      <button class="btn" type="button" @click="integral.reload()">{{ t("refresh") }}</button>
      <button class="btn" type="button" @click="getRandomQuote()">{{ t("random") }}</button>
      <a class="btn" :href="`${API_BASE}/example/quotes.csv`" download>{{ t("csv") }}</a>
    </p>
    <hr />
    <p>{{ t("summary", { count: data.count, changes: data.changes }) }}</p>
    <hr />
    <h2>{{ t("ratings") }}</h2>
    <ul class="chart" :data-filtered="rating || undefined">
      <li v-for="(count, i) in data.ratings" :key="i">
        <button type="button" :aria-pressed="rating === i + 1" @click="toggle(i + 1)">
          <span class="label">{{ i + 1 }}★</span>
          <span class="track"
            ><span class="bar" :style="{ width: `${(count / max) * 100}%` }"
          /></span>
          <span class="value">{{ count }}</span>
        </button>
      </li>
    </ul>
    <hr />
    <h2>{{ rating ? t("rated", { n: rating }) : t("quotes") }}</h2>
    <p v-if="!shown.length">{{ t("none") }}</p>
    <ul class="quotes">
      <li v-for="quote in shown" :key="quote.id">
        <a :href="`${integral.base}/example/quotes/${quote.id}`">{{ quote.text }}</a>
        <span class="meta">{{ quote.author }}</span>
        <span class="stars">{{ stars(quote.rating) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.stats-wrapper {
  max-width: 800px;
  margin: 20px auto;
}
.links {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  justify-content: flex-end;
}
hr {
  margin: 1rem 0;
  border: none;
  border-top: 1px solid rgb(128 128 128 / 0.15);
}
h2 {
  margin-top: 1rem;
  font-weight: 600;
}
.chart {
  display: flex;
  flex-direction: column-reverse;
  gap: 0.25rem;
  margin-top: 0.5rem;
}
.quotes {
  margin-top: 0.5rem;
}
.quotes li {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.375rem 0;
  border-bottom: 1px solid rgb(128 128 128 / 0.15);
}
.quotes a {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-decoration: underline;
}
.meta {
  font-size: 0.875rem;
  opacity: 0.7;
}
.stars {
  color: #f59e0b;
  letter-spacing: 0.1em;
}
.chart button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  text-align: left;
  cursor: pointer;
}
.chart button:hover {
  background: rgb(128 128 128 / 0.08);
}
.chart button[aria-pressed="true"] {
  background: rgb(245 158 11 / 0.15);
}
.chart[data-filtered] button[aria-pressed="false"] {
  opacity: 0.5;
}
.label,
.value {
  width: 2rem;
  font-size: 0.875rem;
}
.value {
  text-align: right;
}
.track {
  flex: 1;
  height: 1rem;
  border-radius: 0.25rem;
  background: rgb(128 128 128 / 0.15);
}
.bar {
  display: block;
  height: 100%;
  border-radius: 0.25rem;
  background: #f59e0b;
}
</style>
