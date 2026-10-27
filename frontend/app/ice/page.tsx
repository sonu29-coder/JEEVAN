import { GridProvider } from '@/components/hemo/grid-store'
import { IceDashboard } from '@/components/hemo/ice-dashboard'
import { NccEmergencyModal } from '@/components/hemo/ncc-emergency-modal'
import { GridToast } from '@/components/hemo/grid-toast'

export default function IcePage() {
  return (
    <GridProvider>
      <IceDashboard />
      <NccEmergencyModal />
      <GridToast />
    </GridProvider>
  )
}
