<script setup lang="ts">
import { computed } from 'vue'
import { rewardById } from '../lib/rewards'

const props = withDefaults(
  defineProps<{
    itemId: string
    size?: number
  }>(),
  { size: 18 },
)

const item = computed(() => rewardById(props.itemId))
</script>

<template>
  <span
    v-if="item"
    class="rb"
    :class="item.tier"
    :title="item.name"
    :style="{
      width: size + 'px',
      height: size + 'px',
      fontSize: Math.max(9, Math.round(size * 0.55)) + 'px',
    }"
  >
    {{ item.char }}
  </span>
</template>

<style scoped>
.rb {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px solid transparent;
  font-family: var(--font-display);
  font-weight: 700;
  line-height: 1;
  vertical-align: middle;
}

.rb.bronze {
  background: #f0e2d3;
  border-color: #d9b58f;
  color: #8a5a2b;
}

.rb.silver {
  background: #e9edf1;
  border-color: #bcc7d1;
  color: #55636f;
}

.rb.gold {
  background: #f6ebcf;
  border-color: #dcc07a;
  color: #8a6a1a;
}

[data-theme='night'] .rb.bronze,
[data-theme='ink'] .rb.bronze,
[data-theme='nocturne'] .rb.bronze {
  background: #2c2218;
  border-color: #54402a;
  color: #d9a771;
}

[data-theme='night'] .rb.silver,
[data-theme='ink'] .rb.silver,
[data-theme='nocturne'] .rb.silver {
  background: #222a32;
  border-color: #3c4a57;
  color: #b6c5d2;
}

[data-theme='night'] .rb.gold,
[data-theme='ink'] .rb.gold,
[data-theme='nocturne'] .rb.gold {
  background: #2b2416;
  border-color: #564622;
  color: #e3c079;
}
</style>
