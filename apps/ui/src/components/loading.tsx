import { Spin } from "antd";
import type { FC } from "react";
import { useTranslation } from "react-i18next";

const Loading: FC = () => {
  const { t } = useTranslation();
  return (
    <div className="wb-loading" role="status" aria-live="polite">
      <span aria-hidden="true">
        <Spin />
      </span>
      <span>{t("wbLoading")}</span>
    </div>
  );
};

export default Loading;
