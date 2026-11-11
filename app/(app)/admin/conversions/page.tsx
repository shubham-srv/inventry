import { Pencil, Plus, Trash2, ChevronRight } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { parseListParams } from "@/lib/query"
import {
  createPackagingChain,
  updatePackagingChain,
  deletePackagingChain,
} from "@/lib/actions/packaging"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { getT } from "@/lib/i18n/server"

type Row = {
  id: number
  name: string
  materialCategoryCode: string
  materialCategory: { name: string }
  levels: { level: number; unitName: string }[]
  _count: { itemVendors: number }
}

export default async function ConversionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_CONVERSIONS)
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)

  const where = raw.q
    ? {
        OR: [
          { name: { contains: raw.q } },
          { materialCategory: { name: { contains: raw.q } } },
        ],
      }
    : {}

  const [rows, total, categories] = await Promise.all([
    prisma.packagingChain.findMany({
      where,
      include: {
        materialCategory: true,
        levels: { orderBy: { level: "asc" } },
        _count: { select: { itemVendors: true } },
      },
      orderBy: [{ materialCategoryCode: "asc" }, { name: "asc" }],
      skip,
      take,
    }),
    prisma.packagingChain.count({ where }),
    prisma.materialCategory.findMany({ orderBy: { name: "asc" } }),
  ])

  const fields: Field[] = [
    {
      name: "materialCategoryCode",
      label: t("admin.conversions.materialCategory"),
      type: "select",
      required: true,
      placeholder: t("admin.conversions.selectCategory"),
      options: categories.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code })),
      description: t("admin.conversions.materialCategoryHelp"),
    },
    { name: "name", label: t("admin.common.name"), type: "text", required: true, placeholder: "Bags → Boxes → Cases", colSpan: 2 },
    {
      name: "levels",
      label: t("admin.conversions.levels"),
      type: "text",
      required: true,
      placeholder: "Boxes, Cases",
      colSpan: 2,
      description: t("admin.conversions.levelsHelp"),
    },
  ]

  const columns: Column<Row>[] = [
    {
      key: "chain",
      header: t("admin.conversions.chain"),
      cell: (r) => (
        <div>
          <span className="flex flex-wrap items-center gap-1 font-medium">
            {/* Level 0 is the item's own quantity, labelled by its category. */}
            <Badge variant="secondary" className="font-mono text-[10px]">{r.materialCategory.name}</Badge>
            {r.levels.map((l) => (
              <span key={l.level} className="flex items-center gap-1">
                <ChevronRight className="text-muted-foreground size-3" />
                <Badge variant="outline">{l.unitName}</Badge>
              </span>
            ))}
          </span>
          <p className="text-muted-foreground mt-0.5 text-xs">{r.name}</p>
        </div>
      ),
    },
    { key: "category", header: t("admin.common.category"), cell: (r) => r.materialCategory.name },
    {
      key: "used",
      header: t("admin.conversions.usedBy"),
      className: "tabular-nums",
      cell: (r) =>
        r._count.itemVendors === 1
          ? t("admin.conversions.mappingOne")
          : t("admin.conversions.mappingMany", { count: r._count.itemVendors }),
    },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog
            title={t("admin.conversions.editChain")}
            fields={fields}
            action={updatePackagingChain}
            values={{
              id: r.id,
              materialCategoryCode: r.materialCategoryCode,
              name: r.name,
              levels: r.levels.map((l) => l.unitName).join(", "),
            }}
            submitLabel={t("admin.common.saveChanges")}
            trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}><Pencil /></Button>}
          />
          <ConfirmButton
            title={t("admin.conversions.deleteChain")}
            description={t("admin.conversions.deleteDescription", { name: r.name })}
            confirmLabel={t("admin.common.delete")}
            typeToConfirm
            action={deletePackagingChain.bind(null, r.id)}
            trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.delete")}><Trash2 /></Button>}
          />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={t("nav.conversions")}
        description={t("admin.conversions.description")}
      />
      <div className="space-y-4">
        <DataTableToolbar searchPlaceholder={t("admin.conversions.searchPlaceholder")}>
          <EntityFormDialog
            title={t("admin.conversions.newChain")}
            fields={fields}
            action={createPackagingChain}
            submitLabel={t("admin.common.create")}
            trigger={<Button size="sm"><Plus className="size-4" /> {t("admin.conversions.addChain")}</Button>}
          />
        </DataTableToolbar>
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          page={page}
          pageCount={Math.ceil(total / pageSize)}
          total={total}
          searchParams={raw}
        />
      </div>
    </>
  )
}
