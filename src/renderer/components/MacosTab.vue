<script setup lang="ts">
defineProps<{
  tabs: { key: string; label: string }[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <div
    class="inline-flex rounded-lg bg-black/5 p-0.5"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :class="[
        'relative cursor-pointer rounded-md px-4 py-1.5 text-[11px] font-medium tracking-wide transition-all',
        modelValue === tab.key
          ? 'bg-white text-black/80 shadow-[0_1px_2px_rgba(0,0,0,0.1)]'
          : 'text-black/40 hover:text-black/60'
      ]"
      @click="emit('update:modelValue', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
