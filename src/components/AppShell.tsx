import { Link, useRouterState } from "@tanstack/react-router";
import {
  Database,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  NotebookPen,
  Pin,
  Salad,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useSession } from "@/hooks/useSession";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/builder", label: "Calculator", icon: NotebookPen },
  { to: "/pinned-assets", label: "Pinned Assets", icon: Pin },
  { to: "/master", label: "Master Data", icon: Database },
  { to: "/rda", label: "RDA Settings", icon: SlidersHorizontal },
] as const;

const ADMIN_NAV = [
  { to: "/admin/activity", label: "Activity log", icon: ScrollText },
] as const;

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/recipes": "Recipes",
  "/builder": "Nutrition Calculator",
  "/pinned-assets": "Pinned assets",
  "/master": "Master Data",
  "/rda": "RDA Settings",
  "/admin": "Activity log",
};


export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const section = "/" + (pathname.split("/")[1] ?? "");
  const isProjectDetail = pathname.startsWith("/projects/") && pathname !== "/projects";
  const title = isProjectDetail ? "Recipes" : (TITLES[section] ?? "Rorosaur");
  const { session, isAdmin, signOut } = useSession();
  const activeProfile = session?.profiles.find((p) => p.id === session.activeProfileId);
  const label = activeProfile?.display_name ?? session?.name ?? "Signed in";
  const initials = label.slice(0, 2).toUpperCase();

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" className="no-print">
        <SidebarHeader className="px-3 py-3">
          <Link to="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Salad className="size-4" />
            </span>
            <span className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
              <span className="font-display text-sm font-semibold">Rorosaur</span>
              <span className="text-[10px] text-muted-foreground">Nutrition Platform</span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map(({ to, label: navLabel, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton asChild tooltip={navLabel} isActive={section === to}>
                      <Link to={to}>
                        <Icon />
                        <span>{navLabel}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          {isAdmin && (
            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {ADMIN_NAV.map(({ to, label: navLabel, icon: Icon }) => (
                    <SidebarMenuItem key={to}>
                      <SidebarMenuButton asChild tooltip={navLabel} isActive={pathname === to}>
                        <Link to={to}>
                          <Icon />
                          <span>{navLabel}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <SidebarFooter className="p-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              <Avatar className="size-7">
                <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <span className="block truncate text-xs font-medium">{label}</span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {isAdmin ? "Administrator" : (session?.email ?? "")}
                </span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                {session?.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void signOut()}>
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-5" />
          <h1 className="truncate text-sm font-semibold">{title}</h1>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-6 md:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
