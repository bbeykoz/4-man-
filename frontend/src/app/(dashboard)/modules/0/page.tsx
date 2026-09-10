'use client'

import { Truck } from 'lucide-react'
import { ModulePageTemplate } from '@/components/common/ModulePageTemplate'

export default function ModulePage() {
  return (
    <ModulePageTemplate
      moduleSlug="0"
      title="Nakliye"
      description="Sevkiyat ve rota yönetimi"
      icon={Truck}
      color="green"
    />
  )
}
