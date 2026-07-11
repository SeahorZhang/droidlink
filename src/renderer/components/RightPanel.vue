<script setup lang="ts">
import AppList from './AppList.vue'

defineProps<{
  serial: string
}>()
</script>

<template>
  <div
    class="flex w-[520px] flex-col rounded-xl border border-black/8 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
  >
    <div class="flex-1 overflow-y-auto">
      <AppList :serial="serial" />
    </div>
  </div>
</template>
