import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { TrendingUp, Clock, Users, MapPin } from "lucide-react";

/**
 * ✅ Client-only Project type (NO DB / NO backend)
 * Keep only fields used by ProjectCard UI.
 */
export type ProjectCardModel = {
  id: string | number;

  titleAr: string;
  locationAr?: string | null;

  projectType: "sukuk" | "land_development" | "vip_exclusive" | string;

  issueNumber?: string | number;

  coverImage?: string | null;
  vipOnly?: boolean;

  targetAmount?: number | string | null;
  currentAmount?: number | string | null;

  annualReturn?: number | string | null;
  duration?: number | string | null;

  investorsCount?: number | string | null;

  status?: "draft" | "published" | "closed" | "completed" | string;
};

interface ProjectCardProps {
  project: ProjectCardModel;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const progress = project.targetAmount
    ? (Number(project.currentAmount || 0) / Number(project.targetAmount)) * 100
    : 0;

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
        {project.coverImage ? (
          <img
            src={project.coverImage}
            alt={project.titleAr}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
            <span className="text-6xl font-bold text-primary/30">M</span>
          </div>
        )}

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
        {project.issueNumber != null && (
          <div className="absolute top-3 right-3">
            <div className="bg-black/70 backdrop-blur-sm px-3 py-1 rounded-full">
              <span className="text-white text-sm font-semibold">
                #{project.issueNumber}
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
                {project.annualReturn ?? 0}%
              </span>
            </div>
            <span className="text-xs text-muted-foreground">عائد سنوي</span>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Clock className="w-4 h-4" />
              <span className="text-lg font-bold">{project.duration ?? 0}</span>
            </div>
            <span className="text-xs text-muted-foreground">شهر</span>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-primary mb-1">
              <Users className="w-4 h-4" />
              <span className="text-lg font-bold">
                {project.investorsCount ?? 0}
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
              {Number.isFinite(progress) ? progress.toFixed(1) : "0.0"}%
            </span>
          </div>

          <Progress value={Number.isFinite(progress) ? progress : 0} className="h-2" />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Number(project.currentAmount || 0).toLocaleString()} ر.س</span>
            <span>{Number(project.targetAmount || 0).toLocaleString()} ر.س</span>
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
