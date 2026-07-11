<script setup lang="ts">
defineProps<{
  visible: boolean
  title: string
  message: string
}>()

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      @click.self="emit('cancel')"
    >
      <div
        class="w-80 rounded-2xl border border-white/10 bg-[#2a2a2e] p-5 shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
      >
        <h3 class="mb-2 text-[13px] font-medium text-white/80">{{ title }}</h3>
        <p class="mb-5 whitespace-pre-line text-[11px] leading-relaxed text-white/40">
          {{ message }}
        </p>
        <div class="flex justify-end gap-2">
          <button
            class="cursor-pointer rounded-lg px-4 py-1.5 text-[11px] font-medium text-white/40 transition-colors hover:bg-white/5 hover:text-white/60"
            @click="emit('cancel')"
          >
            取消
          </button>
          <button
            class="cursor-pointer rounded-lg bg-red-500/80 px-4 py-1.5 text-[11px] font-medium text-white/90 transition-colors hover:bg-red-500"
            @click="emit('confirm')"
          >
            确认移除
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
