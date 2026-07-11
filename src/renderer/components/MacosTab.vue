<script setup lang="ts">
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

defineProps<{
  tabs: { key: string; label: string }[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<template>
  <TabsRoot :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <TabsList class="inline-flex rounded-lg bg-black/5 p-0.5">
      <TabsTrigger
        v-for="tab in tabs"
        :key="tab.key"
        :value="tab.key"
        class="relative cursor-pointer rounded-md px-4 py-1.5 text-[11px] font-medium tracking-wide transition-all data-[state=active]:bg-white data-[state=active]:text-black/80 data-[state=active]:shadow-[0_1px_2px_rgba(0,0,0,0.1)] text-black/40 hover:text-black/60"
      >
        {{ tab.label }}
      </TabsTrigger>
    </TabsList>
  </TabsRoot>
</template>
