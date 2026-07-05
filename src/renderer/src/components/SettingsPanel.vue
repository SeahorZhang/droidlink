<script setup lang="ts">
const props = defineProps<{
  settings: { maxSize: number; bitRate: string }
}>()

const emit = defineEmits<{
  'update:settings': [settings: { maxSize: number; bitRate: string }]
}>()

const resolutionOptions = [
  { label: '不限制', value: 0 },
  { label: '1K', value: 1080 },
  { label: '2K', value: 1440 },
  { label: '4K', value: 2160 }
]

const bitRateOptions = ['8M', '16M', '24M', '32M', '50M']

const setResolution = (value: number): void => {
  emit('update:settings', { ...props.settings, maxSize: value })
}

const setBitRate = (value: string): void => {
  emit('update:settings', { ...props.settings, bitRate: value })
}
</script>

<template>
  <div class="space-y-5">
    <div>
      <span class="text-[10px] text-white/30 uppercase tracking-wider block mb-2">分辨率</span>
      <div class="flex gap-1.5">
        <button
          v-for="opt in resolutionOptions"
          :key="opt.value"
          :class="[
            'text-[11px] px-2.5 py-1 rounded-md transition-all cursor-pointer',
            settings.maxSize === opt.value
              ? 'bg-white/15 text-white border border-white/20'
              : 'text-white/30 border border-transparent hover:text-white/50 hover:bg-white/5'
          ]"
          @click="setResolution(opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
    <div>
      <span class="text-[10px] text-white/30 uppercase tracking-wider block mb-2">码率</span>
      <div class="flex gap-1.5">
        <button
          v-for="br in bitRateOptions"
          :key="br"
          :class="[
            'text-[11px] px-2.5 py-1 rounded-md transition-all cursor-pointer',
            settings.bitRate === br
              ? 'bg-white/15 text-white border border-white/20'
              : 'text-white/30 border border-transparent hover:text-white/50 hover:bg-white/5'
          ]"
          @click="setBitRate(br)"
        >
          {{ br }}
        </button>
      </div>
    </div>
  </div>
</template>
