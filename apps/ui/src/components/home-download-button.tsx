import { useTranslation } from "react-i18next";
import { DownloadIcon } from "@/assets/svg";
import { Button } from "@/components/ui/button";

interface Props {
  onClick?: () => void;
}

export function HomeDownloadButton({ onClick }: Props) {
  const { t } = useTranslation();

  return (
    <Button type="button" className="rounded-md px-2" onClick={onClick}>
      <DownloadIcon fill="currentColor" />
      {t("newDownload")}
    </Button>
  );
}
