import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import type {NurseryWorker, ServiceType} from '@/lib/nursery-api'
import {useState} from 'react'

const ALL_SERVICES: {type: ServiceType; label: string}[] = [
  {type: 'sunday_school', label: 'Sunday School Service'},
  {type: 'morning', label: 'Morning Service'},
  {type: 'evening', label: 'Evening Service'},
  {type: 'wednesday_evening', label: 'Wednesday Evening Service'},
]

interface WorkerFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: {
    name: string
    maxPerMonth: number
    allowMultiplePerDay: boolean
    services: {serviceType: ServiceType; maxPerMonth: number | null}[]
  }) => void
  worker?: NurseryWorker | null
  isPending?: boolean
}

export function NurseryWorkerForm({open, onOpenChange, onSave, worker, isPending}: WorkerFormProps) {
  const [name, setName] = useState(worker?.name || '')
  const [maxPerMonth, setMaxPerMonth] = useState(worker?.maxPerMonth ?? 4)
  const [allowMultiplePerDay, setAllowMultiplePerDay] = useState(worker?.allowMultiplePerDay ?? false)
  const [services, setServices] = useState<Record<ServiceType, {enabled: boolean; maxPerMonth: string}>>(
    ALL_SERVICES.reduce(
      (acc, svc) => {
        const existing = worker?.services.find((s) => s.serviceType === svc.type)
        acc[svc.type] = {
          enabled: !!existing,
          maxPerMonth: existing?.maxPerMonth?.toString() || '',
        }
        return acc
      },
      {} as Record<ServiceType, {enabled: boolean; maxPerMonth: string}>,
    ),
  )

  // Reset form when dialog opens with new worker
  function resetForm() {
    setName(worker?.name || '')
    setMaxPerMonth(worker?.maxPerMonth ?? 4)
    setAllowMultiplePerDay(worker?.allowMultiplePerDay ?? false)
    setServices(
      ALL_SERVICES.reduce(
        (acc, svc) => {
          const existing = worker?.services.find((s) => s.serviceType === svc.type)
          acc[svc.type] = {
            enabled: !!existing,
            maxPerMonth: existing?.maxPerMonth?.toString() || '',
          }
          return acc
        },
        {} as Record<ServiceType, {enabled: boolean; maxPerMonth: string}>,
      ),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    const enabledServices = ALL_SERVICES.filter((svc) => services[svc.type].enabled).map((svc) => ({
      serviceType: svc.type,
      maxPerMonth: services[svc.type].maxPerMonth ? Number(services[svc.type].maxPerMonth) : null,
    }))

    onSave({name: name.trim(), maxPerMonth, allowMultiplePerDay, services: enabledServices})
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) resetForm()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{worker ? 'Edit Worker' : 'Add Worker'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Worker name" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxPerMonth">Max times per month</Label>
            <Input
              id="maxPerMonth"
              type="number"
              min={1}
              max={20}
              value={maxPerMonth}
              onChange={(e) => setMaxPerMonth(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="allowMultiple"
              checked={allowMultiplePerDay}
              onCheckedChange={(c) => setAllowMultiplePerDay(c === true)}
            />
            <Label htmlFor="allowMultiple" className="text-sm">
              Allow multiple services on the same day
            </Label>
          </div>

          <div className="space-y-3">
            <Label>Eligible Services</Label>
            {ALL_SERVICES.map((svc) => (
              <div key={svc.type} className="flex items-center gap-3">
                <Checkbox
                  id={`svc-${svc.type}`}
                  checked={services[svc.type].enabled}
                  onCheckedChange={(c) =>
                    setServices((prev) => ({...prev, [svc.type]: {...prev[svc.type], enabled: c === true}}))
                  }
                />
                <Label htmlFor={`svc-${svc.type}`} className="text-sm flex-1">
                  {svc.label}
                </Label>
                {services[svc.type].enabled && (
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    placeholder="No limit"
                    className="w-24 h-8 text-xs"
                    value={services[svc.type].maxPerMonth}
                    onChange={(e) =>
                      setServices((prev) => ({...prev, [svc.type]: {...prev[svc.type], maxPerMonth: e.target.value}}))
                    }
                  />
                )}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Optional per-service limit (leave blank for no per-service limit)
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isPending}>
              {worker ? 'Save Changes' : 'Add Worker'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
