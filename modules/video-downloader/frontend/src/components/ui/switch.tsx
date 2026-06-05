import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'

import { cn } from './utils'

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn('mtb-switch', className)}
      {...props}
    >
      <SwitchPrimitive.Thumb data-slot="switch-thumb" className="mtb-switch-thumb" />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
