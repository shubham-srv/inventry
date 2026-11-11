import { Pencil, Plus, Trash2 } from "lucide-react"
import { prisma } from "@/lib/db"
import { requireCapability } from "@/lib/auth/session"
import { CAPABILITIES } from "@/lib/rbac"
import { categoriesWhere } from "@/lib/admin/queries"
import { parseListParams } from "@/lib/query"
import { createCategory, updateCategory, deleteCategory } from "@/lib/actions/master-data"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { DataTable, type Column } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import { EntityFormDialog, type Field } from "@/components/crud/entity-form-dialog"
import { ConfirmButton } from "@/components/crud/confirm-button"
import { TranslationBadge } from "@/components/translation-badge"
import { getT } from "@/lib/i18n/server"

type Row = {
  code: string
  name: string
  _count: { items: number; subCategories: number }
  translations: { name: string; isMachine: boolean }[]
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability(CAPABILITIES.MANAGE_MASTER_DATA)
  const t = await getT()
  const { page, pageSize, skip, take, raw } = parseListParams(await searchParams)
  const where = categoriesWhere(raw)
  const [rows, total, allCategories] = await Promise.all([
    prisma.materialCategory.findMany({
      where,
      include: {
        _count: { select: { items: true, subCategories: true } },
        translations: { where: { locale: "es" }, select: { name: true, isMachine: true } },
      },
      orderBy: { code: "asc" },
      skip,
      take,
    }),
    prisma.materialCategory.count({ where }),
    // Every code, unpaged: the create form lists what is taken.
    prisma.materialCategory.findMany({ select: { code: true, name: true }, orderBy: { code: "asc" } }),
  ])

  const fields: Field[] = [
    {
      name: "code",
      label: t("admin.common.code"),
      type: "suggest",
      required: true,
      placeholder: "BX",
      lockOnEdit: true,
      colSpan: 2,
      suggestTitle: t("admin.categories.existingCodes"),
      options: allCategories.map((c) => ({ label: `${c.code} — ${c.name}`, value: c.code })),
      description: t("admin.categories.codeHelp"),
    },
    { name: "name", label: t("admin.common.name"), type: "text", required: true, colSpan: 2 },
    {
      name: "nameEs",
      label: t("admin.categories.spanishName"),
      type: "text",
      translationOf: "name",
      colSpan: 2,
      description: t("admin.categories.spanishNameHelp"),
    },
  ]

  const columns: Column<Row>[] = [
    { key: "code", header: t("admin.common.code"), className: "font-mono text-xs", cell: (r) => r.code },
    {
      key: "name",
      header: t("admin.common.name"),
      cell: (r) => (
        <div className="space-y-1">
          <span className="font-medium">{r.name}</span>
          <div>
            <TranslationBadge translation={r.translations[0]} />
          </div>
        </div>
      ),
    },
    { key: "subs", header: t("nav.subCategories"), cell: (r) => r._count.subCategories },
    { key: "items", header: t("admin.common.items"), cell: (r) => r._count.items },
    {
      key: "actions",
      header: "",
      headClassName: "w-0",
      className: "text-right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <EntityFormDialog title={t("admin.categories.editCategory")} fields={fields} action={updateCategory} values={{ code: r.code, name: r.name, nameEs: r.translations[0]?.name ?? "" }} submitLabel={t("admin.common.saveChanges")} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.edit")}><Pencil /></Button>} />
          <ConfirmButton title={t("admin.categories.deleteCategory")} description={t("admin.categories.deleteDescription", { code: r.code })} confirmLabel={t("admin.common.delete")} typeToConfirm action={deleteCategory.bind(null, r.code)} trigger={<Button variant="ghost" size="icon-sm" aria-label={t("admin.common.delete")}><Trash2 /></Button>} />
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t("admin.categories.title")} description={t("admin.categories.description")} />
      <div className="space-y-4">
        <DataTableToolbar searchPlaceholder={t("admin.categories.searchPlaceholder")} exportEntity="categories">
          <EntityFormDialog title={t("admin.categories.newCategory")} fields={fields} action={createCategory} submitLabel={t("admin.common.create")} trigger={<Button size="sm"><Plus className="size-4" /> {t("admin.categories.addCategory")}</Button>} />
        </DataTableToolbar>
        <DataTable columns={columns} rows={rows} getRowKey={(r) => r.code} page={page} pageCount={Math.ceil(total / pageSize)} total={total} searchParams={raw} />
      </div>
    </>
  )
}
