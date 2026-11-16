import * as React from "react"
import * as LucideIcons from "lucide-react"

type Props = React.SVGProps<SVGSVGElement> & {
  lucide?: string
  tabler?: string
  hugeicons?: string
  phosphor?: string
  remixicon?: string
  size?: number | string
}

const icons = LucideIcons as unknown as Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>>

export function IconPlaceholder({ lucide, tabler, hugeicons, phosphor, remixicon, size, ...props }: Props) {
  const name = lucide?.replace(/Icon$/, "")
  const Icon = (name && icons[name]) || icons.CircleHelp
  return <Icon aria-hidden="true" width={size} height={size} {...props} />
}
