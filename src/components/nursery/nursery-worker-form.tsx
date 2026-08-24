import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle} from '@/components/ui/dialog'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {PersonPicker} from '@/components/ui/person-picker'
import type {NurseryWorker, ServiceConfig} from '@/lib/nursery-api'
import {useState} from 'react'

interface WorkerFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: {
    personId: number
    name: string | null
    maxPerMonth: number
    allowMultiplePerDay: boolean
    services: {serviceTimeId: number; maxPerMonth: number | null}[]
  }) => void
  worker?: NurseryWorker | null
  // Eligible services come from the app's Service Times. See docs/adr/0025.
  serviceConfig: ServiceConfig[]
  isPending?: boolean
}

export function NurseryWorkerForm({open, onOpenChange, onSave, worker, serviceConfig, isPending}: WorkerFormProps) {
  const allServices = serviceConfig.filter((s) => s.active).sort((a, b) => a.sortOrder - b.sortOrder)

  const [personId, setPersonId] = useState<number | null>(worker?.personId ?? null)
  const [name, setName] = useState(worker?.name || '')
  const [maxPerMonth, setMaxPerMonth] = useState(worker?.maxPerMonth ?? 4)
  const [allowMultiplePerDay, setAllowMultiplePerDay] = useState(worker?.allowMultiplePerDay ?? false)
  const [services, setServices] = useState<Record<number, {enabled: boolean; maxPerMonth: string}>>(() =>
    buildServiceState(allServices, worker),
  )

  function buildServiceState(list: ServiceConfig[], w?: NurseryWorker | null) {
    return list.reduce<Record<number, {enabled: boolean; maxPerMonth: string}>>((acc, svc) => {
      const existing = w?.services.find((s) => s.serviceTimeId === svc.serviceTimeId)
      acc[svc.serviceTimeId] = {enabled: !!existing, maxPerMonth: existing?.maxPerMonth?.toString() || ''}
      return acc
    }, {})
  }

  // Reset form when dialog opens with new worker
  function resetForm() {
    setPersonId(worker?.personId ?? null)
    setName(worker?.name || '')
    setMaxPerMonth(worker?.maxPerMonth ?? 4)
    setAllowMultiplePerDay(worker?.allowMultiplePerDay ?? false)
    setServices(buildServiceState(allServices, worker))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (personId == null) return

    const enabledServices = allServices
      .filter((svc) => services[svc.serviceTimeId]?.enabled)
      .map((svc) => ({
        serviceTimeId: svc.serviceTimeId,
        maxPerMonth: services[svc.serviceTimeId].maxPerMonth ? Number(services[svc.serviceTimeId].maxPerMonth) : null,
      }))

    onSave({
      personId,
      name: name.trim() ? name.trim() : null,
      maxPerMonth,
      allowMultiplePerDay,
      services: enabledServices,
    })
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
            <Label>Contact</Label>
            <PersonPicker value={personId} onChange={setPersonId} placeholder="Select contact..." />
            <p className="text-xs text-muted-foreground">
              A nursery worker is always a contact — that is what lets us catch her being scheduled to sing during a
              service she is working.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Prints as (optional)</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Leave blank to use the contact's name"
            />
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
            {allServices.map((svc) => (
              <div key={svc.serviceTimeId} className="flex items-center gap-3">
                <Checkbox
                  id={`svc-${svc.serviceTimeId}`}
                  checked={services[svc.serviceTimeId]?.enabled ?? false}
                  onCheckedChange={(c) =>
                    setServices((prev) => ({
                      ...prev,
                      [svc.serviceTimeId]: {...prev[svc.serviceTimeId], enabled: c === true},
                    }))
                  }
                />
                <Label htmlFor={`svc-${svc.serviceTimeId}`} className="text-sm flex-1">
                  {svc.label}
                </Label>
                {services[svc.serviceTimeId]?.enabled && (
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    placeholder="No limit"
                    className="w-24 h-8 text-xs"
                    value={services[svc.serviceTimeId].maxPerMonth}
                    onChange={(e) =>
                      setServices((prev) => ({
                        ...prev,
                        [svc.serviceTimeId]: {...prev[svc.serviceTimeId], maxPerMonth: e.target.value},
                      }))
                    }
                  />
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending || personId == null}>
              {isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
