<script setup lang="ts">
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui'

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
  <DialogRoot :open="visible">
    <DialogPortal>
      <DialogOverlay
      class="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in"
    />
    <DialogContent
      class="fixed left-1/2 top-1/2 z-50 w-80 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-black/8 bg-white p-5 shadow-[0_4px_16px_rgba(0,0,0,0.12)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95"
    >
      <h3 class="mb-2 text-[13px] font-medium text-black/80">{{ title }}</h3>
      <p class="mb-5 whitespace-pre-line text-[11px] leading-relaxed text-black/50">
        {{ message }}
      </p>
      <div class="flex justify-end gap-2">
        <button
          class="cursor-pointer rounded-lg px-4 py-1.5 text-[11px] font-medium text-black/50 transition-colors hover:bg-black/5"
          @click="emit('cancel')"
        >
          取消
        </button>
        <button
          class="cursor-pointer rounded-lg bg-red-500 px-4 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-red-600"
          @click="emit('confirm')"
        >
          确认移除
        </button>
      </div>
    </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
