import { Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { commoditiesWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import {
  createCommodity,
  updateCommodity,
  deleteCommodity,
  setCommodityActive,
} from "@/lib/actions/master-data"
import { StatusBadge } from "@/components/status-badge"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import {
  EntityFormDialog,
  type Field,
} from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"

const fields: Field[] = [
  {
    name: "code",
    label: "Code",
    type: "text",
    required: true,
    placeholder: "AP",
    lockOnEdit: true,
    description: "Short commodity code, e.g. AP",
  },
  { name: "name", label: "Name", type: "text", required: true, colSpan: 2 },
]

type Row = { code: string; name: string; isActive: boolean; _count: { items: number } }

export default async function CommoditiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_MASTER_DATA)
  const { page, pageSize, skip, take, raw } = parseListParams(
    await searchParams
  )
  const where = commoditiesWhere(raw)
  const [rows, total] = await Promise.all([
    prisma.commodity.findMany({
      where,
      include: { _count: { select: { items: true } } },
      orderBy: { code: "asc" },
      skip,
      take,
    }),
    prisma.commodity.count({ where }),
  ])

  const columns: Column<Row>[] = [
    {
      key: "code",
      header: "Code",
      className: "font-mono text-xs",
      cell: (r) => r.code,
    },
    {
      key: "name",
      header: "Name",
      cell: (r) => <span className="font-medium">{r.name}</span>,
    },
    { key: "items", header: "Items", cell: (r) => r._count.items },
    {
      key: "status",
      header: "Status",
      cell: (r) => <StatusBadge status={r.isActive ? "Active" : "Inactive"} />,
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <ConfirmButton
            title={r.isActive ? `Disable ${r.code}?` : `Enable ${r.code}?`}
            description={
              r.isActive
                ? `Its ${r._count.items} item(s) disappear from grower and vendor screens, pickers and current reports until it is enabled again. The items themselves are not changed.`
                : `Its ${r._count.items} item(s) come back exactly as they were — items that were inactive on their own stay inactive.`
            }
            confirmLabel={r.isActive ? "Disable" : "Enable"}
            variant={r.isActive ? "destructive" : "default"}
            action={setCommodityActive.bind(null, r.code, !r.isActive)}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={r.isActive ? "Disable" : "Enable"}>
                {r.isActive ? <PowerOff /> : <Power />}
              </Button>
            }
          />
          <EntityFormDialog
            title="Edit commodity"
            fields={fields}
            action={updateCommodity}
            values={{ code: r.code, name: r.name }}
            submitLabel="Save changes"
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Edit">
                <Pencil />
              </Button>
            }
          />
          <ConfirmButton
            title="Delete commodity"
            description={`Delete ${r.code}?`}
            confirmLabel="Delete" typeToConfirm
            action={deleteCommodity.bind(null, r.code)}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label="Delete">
                <Trash2 />
              </Button>
            }
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Commodities"
        description="Top-level commodity codes."
      />
      <div className="space-y-4">
        <DataTableToolbar
          searchPlaceholder="Search commodities…"
          exportEntity="commodities"
          filters={[
            {
              key: "status",
              label: "Status",
              options: [
                { label: "Active", value: "active" },
                { label: "Disabled", value: "inactive" },
              ],
            },
          ]}
        >
          <EntityFormDialog
            title="New commodity"
            fields={fields}
            action={createCommodity}
            submitLabel="Create"
            trigger={
              <Button size="sm">
                <Plus className="size-4" /> Add commodity
              </Button>
            }
          />
        </DataTableToolbar>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.code}
          page={page}
          pageCount={Math.ceil(total / pageSize)}
          total={total}
          searchParams={raw}
        />
      </div>
    </>
  )
}
