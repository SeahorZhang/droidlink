<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger' | 'link'
    disabled?: boolean
  }>(),
  {
    variant: 'ghost',
    disabled: false
  }
)
</script>

<template>
  <button
    :disabled="disabled"
    :class="[
      'inline-flex items-center justify-center text-[11px] px-2.5 py-1 rounded-md font-medium transition-all duration-150 active:scale-95 whitespace-nowrap cursor-pointer',
      disabled && 'opacity-20 cursor-not-allowed',
      variant === 'primary' &&
        'bg-emerald-500/70 hover:bg-emerald-500/90 text-white/80 hover:text-white disabled:active:scale-100',
      variant === 'ghost' && 'text-white/25 hover:text-white/50 hover:bg-white/5',
      variant === 'danger' && 'text-red-400/70 hover:text-red-400 hover:bg-red-500/10',
      variant === 'link' && 'text-white/20 hover:text-white/40 hover:bg-white/[0.03]'
    ]"
  >
    <slot />
  </button>
</template>
