import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { TrendingUp, Clock, Users, MapPin } from "lucide-react";
import { getProjectBusinessId } from "@/lib/businessIds";
import {
  normalizeProjectImagePath,
  PROJECT_IMAGE_FALLBACK,
} from "@/lib/publicAssets";
import {
  formatCurrencyEN,
  formatNumberEN,
  formatPercentEN,
  normalizeEnglishDigits,
} from "@/lib/formatters";
import { getProjectComputedAmounts } from "@/lib/projectAmounts";

/**
 * ✅ Client-only Project type (NO DB / NO backend)
 * Keep only fields used by ProjectCard UI.
 */
export type ProjectCardModel = {
  id: string | number;

  titleAr: string;
  locationAr?: string | null;

  projectType: "sukuk" | "land_development" | "vip_exclusive" | string;

  businessId?: string;
  issueNumber?: string | number;

  coverImage?: string | null;
  vipOnly?: boolean;

  targetAmount?: number | string | null;
  currentAmount?: number | string | null;
  coverageRate?: number | string | null;
  baseCoveredAmount?: number | string | null;
  investmentsAmount?: number | string | null;

  annualReturn?: number | string | null;
  duration?: number | string | null;

  investorsCount?: number | string | null;

  status?: "draft" | "published" | "closed" | "completed" | string;
};

interface ProjectCardProps {
  project: ProjectCardModel;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const projectReference = getProjectBusinessId(project);
  const computedAmounts = getProjectComputedAmounts(project);
  const progress = computedAmounts.progressPercent;
  const coverImage = normalizeProjectImagePath(project.coverImage);

  const getProjectTypeLabel = (type: string) => {
    switch (type) {
      case "sukuk":
        return "استثمار بالصكوك";
      case "land_development":
        return "تطوير أراضي";
      case "vip_exclusive":
        return "VIP حصري";
      default:
        return type;
    }
  };

  // (موجودة عندك لكن ما تستخدمها في UI حاليا) خليتها لأنك كاتبها
  const getStatusColor = (status: string) => {
    switch (status) {
      case "published":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      case "closed":
        return "bg-red-500/10 text-red-700 border-red-500/20";
      case "completed":
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <Card className="group overflow-hidden hover:shadow-xl transition-all duration-300 border-border">
      {/* Project Image */}
      <div className="relative h-48 overflow-hidden">
        <img
          src={coverImage}
          alt={project.titleAr}
          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          onError={event => {
            const image = event.currentTarget;
            if (image.src.includes(PROJECT_IMAGE_FALLBACK)) return;
            image.src = PROJECT_IMAGE_FALLBACK;
          }}
        />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge className="bg-primary text-primary-foreground">
            {getProjectTypeLabel(project.projectType)}
          </Badge>

          {project.vipOnly && (
            <Badge className="bg-accent text-accent-foreground">VIP فقط</Badge>
          )}
        </div>

        {/* Issue Number */}
        {projectReference && (
          <div className="absolute top-3 right-3">
            <div className="bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full">
              <span className="text-white text-sm font-semibold">
                {normalizeEnglishDigits(projectReference)}
              </span>
            </div>
          </div>
        )}
      </div>

      <CardContent className="p-6">
        {/* Title */}
        <h3 className="text-xl font-bold mb-2 line-clamp-2 group-hover:text-primary transition-colors">
          {project.titleAr}
        </h3>

        {/* Location */}
        {project.locationAr && (
          <div className="flex items-center gap-2 text-muted-foreground mb-4">
            <MapPin className="w-4 h-4" />
            <span className="text-sm">{project.locationAr}</span>
          </div>
        )}

        {/* Financial Info */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-lg font-bold">
                {formatPercentEN(project.annualReturn ?? 0, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">عائد سنوي</span>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-lg font-bold">{formatNumberEN(project.duration ?? 0)}</span>
            </div>
            <span className="text-xs text-muted-foreground">شهر</span>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Users className="w-4 h-4" />
              <span className="text-lg font-bold">
                {formatNumberEN(computedAmounts.remainingInvestorsCount)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">مستثمر</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">التقدم</span>
            <span className="font-semibold text-primary">
              {formatPercentEN(Number.isFinite(progress) ? progress : 0, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}
            </span>
          </div>

          <Progress value={Number.isFinite(progress) ? progress : 0} className="h-2" />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatCurrencyEN(computedAmounts.currentAmount)}</span>
            <span>{formatCurrencyEN(computedAmounts.targetAmount)}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-6 pt-0">
        <Link href={`/projects/${project.id}`} className="w-full">
          <Button className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            عرض التفاصيل
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
