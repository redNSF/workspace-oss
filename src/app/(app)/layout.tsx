import { Sidebar } from "@/components/sidebar";
import { NotificationToastContainer } from "@/components/notification-toast";
import { GlobalSearch } from "@/components/global-search";
import { LayoutWrapper } from "@/components/layout-wrapper";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full bg-[#111111]">
      <Sidebar />
      <LayoutWrapper>
        {children}
      </LayoutWrapper>
      <NotificationToastContainer />
      <GlobalSearch />
    </div>
  );
}
