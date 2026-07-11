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
    class="inline-flex rounded-lg bg-white/[0.06] p-0.5 ring-1 ring-inset ring-white/[0.06]"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :class="[
        'relative cursor-pointer rounded-md px-4 py-1.5 text-[11px] font-medium tracking-wide transition-all',
        modelValue === tab.key
          ? 'bg-white/[0.12] text-white/80 shadow-[0_1px_2px_rgba(0,0,0,0.3)]'
          : 'text-white/30 hover:text-white/50'
      ]"
      @click="emit('update:modelValue', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
