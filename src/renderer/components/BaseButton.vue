<script setup lang="ts">
import { Icon } from '@iconify/vue'

defineProps<{
  variant?: 'primary' | 'secondary' | 'danger'
  icon?: string
  disabled?: boolean
  loading?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    :disabled="disabled || loading"
    :class="[
      'flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg py-2.5 text-[12px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40',
      variant === 'primary' && 'bg-blue-500 text-white hover:bg-blue-600',
      variant === 'secondary' && 'border border-black/8 text-black/50 hover:bg-gray-50 hover:text-black/70',
      variant === 'danger' && 'bg-red-500 text-white hover:bg-red-600'
    ]"
    @click="$emit('click')"
  >
    <Icon v-if="icon && !loading" :icon="icon" class="h-4 w-4" />
    <div
      v-if="loading"
      class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    ></div>
    <slot />
  </button>
</template>
