/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';

import { DoubanItem } from '@/lib/types';
import { useResponsiveGrid } from '@/hooks/useResponsiveGrid';
import VideoCard from '@/components/VideoCard';

const Grid = dynamic(
  () => import('react-window').then(mod => ({ default: mod.Grid })),
  { 
    ssr: false,
    loading: () => <div className="animate-pulse h-96 bg-gray-200 dark:bg-gray-800 rounded-lg" />
  }
);

interface VirtualDoubanGridProps {
  // 豆瓣数据
  doubanData: DoubanItem[];
  
  // 加载状态
  loading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  
  // 分页控制
  onLoadMore: () => void;
  
  // 类型信息
  type: 'movie' | 'tv' | 'show' | 'anime';
}

// 渐进式加载配置
const INITIAL_BATCH_SIZE = 16; // 与原有分页保持一致
const LOAD_MORE_BATCH_SIZE = 16;
const LOAD_MORE_THRESHOLD = 5; // 距离底部还有5行时开始加载

export const VirtualDoubanGrid: React.FC<VirtualDoubanGridProps> = ({
  doubanData,
  loading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  type,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { columnCount, itemWidth, itemHeight, containerWidth } = useResponsiveGrid(containerRef);
  
  // 渐进式加载状态
  const [visibleItemCount, setVisibleItemCount] = useState(INITIAL_BATCH_SIZE);

  // 使用 useMemo 缓存计算结果，减少重新渲染
  const { displayItemCount, displayData, hasNextPage } = useMemo(() => {
    const itemCount = Math.min(visibleItemCount, doubanData.length);
    const data = doubanData.slice(0, itemCount);
    const hasNext = itemCount < doubanData.length || hasMore;
    
    return {
      displayItemCount: itemCount,
      displayData: data,
      hasNextPage: hasNext
    };
  }, [visibleItemCount, doubanData, hasMore]);

  // 重置可见项目数量（当数据变化时）
  useEffect(() => {
    setVisibleItemCount(INITIAL_BATCH_SIZE);
  }, [doubanData]);

  // 加载更多项目
  const loadMoreItems = useCallback(() => {
    if (isLoadingMore) return;
    
    // 如果本地还有数据，优先显示本地数据
    if (displayItemCount < doubanData.length) {
      setVisibleItemCount(prev => Math.min(prev + LOAD_MORE_BATCH_SIZE, doubanData.length));
    } 
    // 如果本地数据显示完了，且还有远程数据，触发远程加载
    else if (hasMore && !isLoadingMore) {
      onLoadMore();
    }
  }, [isLoadingMore, displayItemCount, doubanData.length, hasMore, onLoadMore]);

  // 网格行数计算 - 恢复到正确的计算方式
  const rowCount = useMemo(() => {
    return Math.max(1, Math.ceil(displayItemCount / columnCount));
  }, [displayItemCount, columnCount]);

  // 渲染单个网格项 - 使用稳定的数据获取
  const CellComponent = useCallback(({ 
    columnIndex, 
    rowIndex, 
    style,
    getDisplayData,
    getType,
    columnCount: cellColumnCount,
    displayItemCount: cellDisplayItemCount,
  }: any) => {
    const index = rowIndex * cellColumnCount + columnIndex;
    
    // 如果超出显示范围，返回空
    if (index >= cellDisplayItemCount) {
      return <div style={style} />;
    }

    // 获取最新数据但不触发重新渲染
    const cellDisplayData = getDisplayData();
    const cellType = getType();
    const item = cellDisplayData[index];
    
    if (!item) {
      return <div style={style} />;
    }

    return (
      <div 
        style={{ 
          ...style, 
          padding: '8px',
          contain: 'layout style',  // 单个cell的containment
          backfaceVisibility: 'hidden', // 减少重绘
        }}
      >
        <VideoCard
          id={item.id}
          title={item.title}
          poster={item.poster}
          year={item.year || ''}
          douban_id={item.id}
          from='douban'
          type={cellType === 'movie' ? 'movie' : 'tv'}
          rate={item.rate}
        />
      </div>
    );
  }, []);

  // 计算网格高度
  const gridHeight = Math.min(
    typeof window !== 'undefined' ? window.innerHeight - 200 : 600,
    800
  );

  // 创建稳定的数据context
  const dataContextRef = useRef({
    displayData,
    type,
  });
  
  // 更新数据但不触发Grid重新渲染
  useEffect(() => {
    dataContextRef.current = {
      displayData,
      type,
    };
  }, [displayData, type]);

  // 完全稳定的cellProps - 只传递获取数据的函数
  const stableCellProps = useMemo(() => ({
    getDisplayData: () => dataContextRef.current.displayData,
    getType: () => dataContextRef.current.type,
    columnCount,
    displayItemCount,
  }), [columnCount, displayItemCount]); // 只依赖布局相关的稳定值

  const memoizedStyle = useMemo(() => ({
    overflowX: 'hidden' as const,
    overflowY: 'auto' as const,
    isolation: 'auto' as const,
    transition: 'none',
    // 避免 GPU 层创建导致的闪烁
    transform: 'translateZ(0)',
    backfaceVisibility: 'hidden' as const,
  }), []);

  // 防抖的加载更多回调 - 恢复简单正确的逻辑
  const debounceRef = useRef<NodeJS.Timeout>();
  const memoizedOnCellsRendered = useCallback(({ rowStopIndex }: any) => {
    // 清除之前的防抖
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    if (rowStopIndex >= rowCount - LOAD_MORE_THRESHOLD && hasNextPage && !isLoadingMore) {
      // 使用防抖避免频繁触发
      debounceRef.current = setTimeout(() => {
        if (!isLoadingMore && hasNextPage) {
          loadMoreItems();
        }
      }, 150);
    }
  }, [rowCount, hasNextPage, isLoadingMore, loadMoreItems]);

  return (
    <div 
      ref={containerRef} 
      className='w-full'
      style={{
        contain: 'layout style paint',  // CSS containment 优化
        willChange: 'auto'              // 优化GPU加速
      }}
    >
      {doubanData.length === 0 ? (
        <div className='flex justify-center items-center h-40'>
          {loading ? (
            <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
          ) : (
            <div className='text-center text-gray-500 py-8 dark:text-gray-400'>
              暂无数据
            </div>
          )}
        </div>
      ) : containerWidth <= 100 ? (
        <div className='flex justify-center items-center h-40'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
          <span className='ml-2 text-sm text-gray-500'>
            初始化虚拟滑动... ({Math.round(containerWidth)}px)
          </span>
        </div>
      ) : (
        <Grid
          key={`douban-grid-${Math.floor(containerWidth / 100)}-${columnCount}`}
          cellComponent={CellComponent}
          cellProps={stableCellProps}
          columnCount={columnCount}
          columnWidth={itemWidth + 16}
          defaultHeight={gridHeight}
          defaultWidth={containerWidth}
          rowCount={rowCount}
          rowHeight={itemHeight + 16}
          overscanCount={3}
          style={memoizedStyle}
          onCellsRendered={memoizedOnCellsRendered}
        />
      )}
      
      {/* 加载更多指示器 */}
      {containerWidth > 100 && isLoadingMore && (
        <div className='flex justify-center items-center py-4'>
          <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500'></div>
          <span className='ml-2 text-sm text-gray-500 dark:text-gray-400'>
            加载更多...
          </span>
        </div>
      )}
      
      {/* 已加载完所有内容的提示 */}
      {containerWidth > 100 && !hasNextPage && displayItemCount > INITIAL_BATCH_SIZE && (
        <div className='text-center py-4 text-sm text-gray-500 dark:text-gray-400'>
          已显示全部 {displayItemCount} 个结果
        </div>
      )}
    </div>
  );
};

export default VirtualDoubanGrid;