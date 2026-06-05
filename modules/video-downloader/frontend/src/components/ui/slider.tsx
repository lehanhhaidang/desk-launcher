import * as React from 'react'
import { Slider as SliderPrimitive } from 'radix-ui'

import { cn } from './utils'

function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      className={cn('mtb-slider', className)}
      {...props}
    >
      <SliderPrimitive.Track data-slot="slider-track" className="mtb-slider-track">
        <SliderPrimitive.Range data-slot="slider-range" className="mtb-slider-range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb data-slot="slider-thumb" className="mtb-slider-thumb" />
    </SliderPrimitive.Root>
  )
}

export { Slider }
