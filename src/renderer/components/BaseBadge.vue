<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'blue' | 'indigo' | 'green' | 'red' | 'amber'
  label: string
}>(), {
  variant: 'blue'
})
</script>

<template>
  <span
    :class="[
      'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
      variant === 'blue' && 'bg-blue-500/10 text-blue-500',
      variant === 'indigo' && 'bg-indigo-500/10 text-indigo-500',
      variant === 'green' && 'bg-green-500/10 text-green-600',
      variant === 'red' && 'bg-red-500/10 text-red-500',
      variant === 'amber' && 'bg-amber-500/10 text-amber-600'
    ]"
  >
    {{ label }}
  </span>
</template>
