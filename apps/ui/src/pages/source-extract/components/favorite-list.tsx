import { useMemoizedFn } from "ahooks";
import { App, Form, Input, Modal, Spin } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ADD_FAVORITE, OPEN_FAVORITE } from "@/const";
import { getFavIcon, tdApp } from "@/utils";
import { FavItem } from "./fav-item";
import { useFavorites } from "@/hooks/use-favorites";
import { usePlatform } from "@/hooks/use-platform";
import { useBrowserActions } from "@/hooks/use-browser-actions";
import { getPageTitle } from "@/api/util";
import { Plus } from "lucide-react";
import { sitePresets, presetName, presetForURL } from "../site-presets";
import { siteIcons } from "../site-icons";

export function FavoriteList() {
  const {
    data: favoriteList,
    isLoading,
    error,
    addFavorite,
    removeFavorite,
  } = useFavorites();
  const { contextMenu } = usePlatform();
  const { loadUrl } = useBrowserActions();
  const { t, i18n } = useTranslation();
  const { message } = App.useApp();
  const [favoriteAddForm] = Form.useForm<Favorite>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const onClickLoadItem = useMemoizedFn((item: Favorite) => {
    loadUrl(item.url);
    tdApp.onEvent(OPEN_FAVORITE);
  });

  const handleRemoveFavorite = useMemoizedFn(async (id: number) => {
    try {
      await removeFavorite(id);
    } catch (reason) {
      message.error(reason instanceof Error ? reason.message : String(reason));
    }
  });

  const showModal = useMemoizedFn(() => {
    setIsModalOpen(true);
    tdApp.onEvent(ADD_FAVORITE);
  });

  const handleOk = useMemoizedFn(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const values = await favoriteAddForm.validateFields();
      const icon = getFavIcon(values.url);
      await addFavorite({
        url: values.url,
        title: values.title,
        icon,
      });
      favoriteAddForm.resetFields();

      setIsModalOpen(false);
    } catch (err: unknown) {
      if (!(err && typeof err === "object" && "errorFields" in err))
        message.error((err as Error).message || t("addFavoriteFailed"));
    } finally {
      setSaving(false);
    }
  });

  const handleCancel = useMemoizedFn(() => {
    setIsModalOpen(false);
  });

  // Auto-fill the title from the page's <title> tag when the user leaves
  // the URL field, unless they already typed a title themselves.
  const handleUrlBlur = useMemoizedFn(async () => {
    const url: string = favoriteAddForm.getFieldValue("url");
    if (!url || !/^https?:\/\/.+/.test(url)) return;
    if (favoriteAddForm.getFieldValue("title")) return;
    try {
      const { data: title } = await getPageTitle(url);
      // Re-check: the user may have typed something while we were fetching.
      if (
        favoriteAddForm.getFieldValue("url") === url &&
        !favoriteAddForm.getFieldValue("title") &&
        title
      ) {
        favoriteAddForm.setFieldValue("title", title);
      }
    } catch {
      // Best-effort: leave title blank if fetch fails; server falls back to URL.
    }
  });

  const handleContextMenu = useMemoizedFn(async (item: Favorite) => {
    const action = await contextMenu.show([
      { key: "open", label: t("open") },
      { key: "separator", label: "", type: "separator" },
      { key: "delete", label: t("delete") },
    ]);
    if (action === "open") {
      loadUrl(item.url);
    } else if (action === "delete") {
      await handleRemoveFavorite(item.id);
    }
  });

  return (
    <div className="se-home" data-testid="source-home">
      {(["domestic", "international"] as const).map((region) => (
        <section
          key={region}
          className="se-site-section"
          aria-labelledby={"source-sites-" + region}
        >
          <div className="se-section-heading">
            <h2 id={"source-sites-" + region}>
              {t(
                region === "domestic"
                  ? "seDomesticSites"
                  : "seInternationalSites",
              )}
            </h2>
          </div>
          <div
            className="se-favorites se-presets"
            data-testid={"source-sites-" + region}
          >
            {sitePresets
              .filter((site) => site.region === region)
              .map((site) => (
                <FavItem
                  key={site.id}
                  siteId={site.id}
                  preset
                  title={presetName(site, i18n.resolvedLanguage || "zh")}
                  src={siteIcons[site.id]}
                  onClick={() => loadUrl(site.url)}
                />
              ))}
          </div>
        </section>
      ))}
      <section
        className="se-site-section"
        aria-labelledby="source-personal-favorites"
      >
        <div className="se-section-heading">
          <h2 id="source-personal-favorites">
            {t("seFavorites")} <small>{favoriteList.length}</small>
          </h2>
          <button type="button" className="wb-secondary" onClick={showModal}>
            <Plus size={16} />
            {t("addFavorite")}
          </button>
        </div>
        {isLoading && <Spin size="small" />}
        {error && (
          <p className="se-favorite-error" role="alert">
            {t("loadFailed")}
          </p>
        )}
        <div className="se-favorites">
          {favoriteList.map((item) => {
            const known = presetForURL(item.url);
            return (
              <FavItem
                key={item.id}
                onContextMenu={() => handleContextMenu(item)}
                onClick={() => onClickLoadItem(item)}
                onClose={() => handleRemoveFavorite(item.id)}
                src={
                  (known ? siteIcons[known.id] : undefined) ||
                  item.icon ||
                  getFavIcon(item.url)
                }
                title={item.title}
              />
            );
          })}
        </div>
      </section>
      <Modal
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        title={t("addShortcut")}
        width={500}
        destroyOnHidden
        confirmLoading={saving}
        okText={t("confirm")}
        cancelText={t("cancel")}
      >
        <div className="flex min-h-36 flex-col justify-center">
          <Form<Favorite> form={favoriteAddForm} autoFocus>
            <Form.Item
              name="url"
              label={t("siteUrl")}
              rules={[
                {
                  required: true,
                  message: t("pleaseEnterSiteUrl"),
                },
                {
                  pattern: /^https?:\/\/.+/,
                  message: t("pleaseEnterCorrectUrl"),
                },
              ]}
            >
              <Input
                placeholder={t("pleaseEnterSiteUrl")}
                onBlur={handleUrlBlur}
              />
            </Form.Item>
            <Form.Item name="title" label={t("siteName")}>
              <Input placeholder={t("pleaseEnterSiteName")} />
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
  );
}
